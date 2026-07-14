import { mkdirSync, lstatSync, realpathSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  ZERO_EXTERNAL_EFFECTS_ATTESTATION,
  assertZeroExternalEffectsEnvironment,
} from "../../src/lib/safety/zero-external-effects";
import { assertExactHostedSafeBrowserOrigin } from "../../scripts/staging/safe-browser-host-contract.mjs";
const EXPECTED_STAGING_SAFE_SUFFIX = "qibh";
const EXPECTED_STAGING_PROJECT_FINGERPRINT =
  "c4d7f6ba9f2c678101b45b453998c4fa5755d8ec038f6cfd3ca8de957a0d1f4c";
const EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT = 60;
const STAGING_ACCESS_HEADER = "x-dealflow-staging-access";

function requireValue(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`Safe browser preflight requires ${name}.`);
  return value;
}

function getInternalSecret() {
  return process.env.SAFE_E2E_INTERNAL_SECRET?.trim() ?? "";
}

function getStagingAccessGateSecret() {
  const secret = process.env.STAGING_ACCESS_GATE_SECRET?.trim() ?? "";
  if (secret.length < 43) {
    throw new Error("Hosted acceptance requires the isolated staging access gate.");
  }
  return secret;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function prepareEvidenceDirectory() {
  const configured = requireValue("SAFE_E2E_RESOLVED_OUTPUT_DIR");
  if (!isAbsolute(configured)) {
    throw new Error("SAFE_E2E_RESOLVED_OUTPUT_DIR must be absolute.");
  }
  const directory = resolve(configured);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Safe browser evidence root must be a real directory.");
  }
  const realDirectory = realpathSync(directory);
  const realRepository = realpathSync(process.cwd());
  const fromRepository = relative(realRepository, realDirectory);
  if (
    fromRepository === "" ||
    (!fromRepository.startsWith(`..${sep}`) && fromRepository !== "..")
  ) {
    throw new Error("Safe browser evidence must be written outside the repository.");
  }
  return realDirectory;
}

async function proveHostedZeroExternalEffects(baseUrl: URL) {
  const exactBaseUrl = assertExactHostedSafeBrowserOrigin(baseUrl.toString());
  if (process.env.SAFE_E2E_QA_AUTH !== "true") {
    throw new Error(
      "A configured SAFE_E2E_BASE_URL is a hosted acceptance run and requires SAFE_E2E_QA_AUTH=true.",
    );
  }
  if (
    process.env.SAFE_E2E_ZERO_EXTERNAL_EFFECTS_ATTESTATION !==
    ZERO_EXTERNAL_EFFECTS_ATTESTATION
  ) {
    throw new Error("Hosted acceptance requires the exact zero-external-effects attestation.");
  }
  if (process.env.QA_AUTH_HARNESS_ENABLED !== "true") {
    throw new Error("Hosted acceptance requires QA_AUTH_HARNESS_ENABLED=true.");
  }
  const target = requireValue("DEALFLOW_DEPLOYMENT_TARGET").toLowerCase();
  if (!new Set(["staging", "preview", "test"]).has(target)) {
    throw new Error("Hosted acceptance requires an explicitly attested nonproduction target.");
  }
  const projectRef = requireValue("QA_ISOLATED_SUPABASE_PROJECT_REF");
  if (!projectRef.endsWith(EXPECTED_STAGING_SAFE_SUFFIX)) {
    throw new Error("Hosted acceptance is not bound to the isolated staging safe suffix.");
  }
  if (sha256(projectRef) !== EXPECTED_STAGING_PROJECT_FINGERPRINT) {
    throw new Error("Hosted acceptance is not bound to the exact isolated staging project.");
  }
  const secret = getInternalSecret();
  if (secret.length < 32) {
    throw new Error("Hosted acceptance requires a restricted internal secret of at least 32 characters.");
  }
  const stagingAccessGateSecret = getStagingAccessGateSecret();

  const endpoint = new URL("/api/internal/zero-external-effects", exactBaseUrl);
  const response = await fetch(endpoint, {
    method: "GET",
    redirect: "manual",
    headers: {
      Authorization: `Bearer ${secret}`,
      [STAGING_ACCESS_HEADER]: stagingAccessGateSecret,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        attestation?: string;
        checkedControlCount?: number;
        failedControls?: unknown;
      }
    | null;
  if (
    response.status !== 200 ||
    response.url !== endpoint.toString() ||
    payload?.ok !== true ||
    payload.attestation !== ZERO_EXTERNAL_EFFECTS_ATTESTATION ||
    !Number.isInteger(payload.checkedControlCount) ||
    payload.checkedControlCount !== EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT ||
    !Array.isArray(payload.failedControls) ||
    payload.failedControls.length !== 0
  ) {
    throw new Error(
      `Hosted zero-external-effects preflight failed safely with HTTP ${response.status}.`,
    );
  }
  return {
    ok: true,
    attestation: payload.attestation,
    checkedControlCount: payload.checkedControlCount,
    failedControls: [],
  };
}

export default async function globalSafetyPreflight() {
  const evidenceDirectory = prepareEvidenceDirectory();
  const configuredBaseUrl = process.env.SAFE_E2E_BASE_URL?.trim();
  const mode = configuredBaseUrl ? "hosted_authenticated" : "local_public";
  const result = configuredBaseUrl
    ? await proveHostedZeroExternalEffects(new URL(configuredBaseUrl))
    : assertZeroExternalEffectsEnvironment(process.env);

  const payload = {
    schemaVersion: "dealflow.safe-browser-preflight.v1",
    mode,
    zeroExternalEffects: result,
    authenticatedStatus:
      mode === "hosted_authenticated" ? "required_and_enabled" : "authenticated_deferred",
    publicTestsAuthorized: true,
    authenticatedTestsAuthorized: mode === "hosted_authenticated",
  };
  const outputPath = resolve(evidenceDirectory, "safety-preflight.json");
  if (dirname(outputPath) !== evidenceDirectory) {
    throw new Error("Safe browser preflight output escaped its evidence directory.");
  }
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}
