import { mkdirSync, lstatSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  ZERO_EXTERNAL_EFFECTS_ATTESTATION,
  assertZeroExternalEffectsEnvironment,
} from "../../src/lib/safety/zero-external-effects";

const PRODUCTION_HOSTS = new Set([
  "agentdealflow.io",
  "www.agentdealflow.io",
  "app.agentdealflow.io",
  "internal.agentdealflow.io",
  "clicktoscale.agentdealflow.io",
  "onboarding.agentdealflow.io",
]);
const EXPECTED_STAGING_SAFE_SUFFIX = "qibh";
const EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT = 56;

function requireValue(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`Safe browser preflight requires ${name}.`);
  return value;
}

function getInternalSecret() {
  return (
    process.env.SAFE_E2E_INTERNAL_SECRET?.trim() ||
    process.env.INTERNAL_SYSTEM_JOBS_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ""
  );
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
  if (
    baseUrl.protocol !== "https:" ||
    PRODUCTION_HOSTS.has(baseUrl.hostname.toLowerCase()) ||
    Boolean(baseUrl.username) ||
    Boolean(baseUrl.password) ||
    (baseUrl.pathname !== "/" && baseUrl.pathname !== "") ||
    Boolean(baseUrl.search) ||
    Boolean(baseUrl.hash)
  ) {
    throw new Error("Hosted acceptance requires a nonproduction HTTPS base URL.");
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
  requireValue("QA_EMAIL");
  const secret = getInternalSecret();
  if (secret.length < 32) {
    throw new Error("Hosted acceptance requires a restricted internal secret of at least 32 characters.");
  }

  const endpoint = new URL("/api/internal/zero-external-effects", baseUrl);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
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
