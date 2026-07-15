import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";

import {
  FINAL_VERIFICATION_LOCAL_BROWSER_PASSED_PER_PROJECT,
  FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS,
  FINAL_VERIFICATION_LOCAL_BROWSER_SCREENSHOT_COUNT,
  FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
} from "./final-verification-evidence-contract.mjs";

const NATIVE_POSTGRES_COMMAND_INDEX = 45;
const NATIVE_POSTGRES_COMMAND_PREFIX =
  "node scripts/test-native-postgres-test-adapter.mjs";
const NATIVE_POSTGRES_COMMAND_TEMPLATE =
  `${NATIVE_POSTGRES_COMMAND_PREFIX} ` +
  "--pgbin <DEALFLOW_NATIVE_PGBIN> " +
  "--host <DEALFLOW_NATIVE_PGHOST> " +
  "--port <DEALFLOW_NATIVE_PGPORT> " +
  "--user <DEALFLOW_NATIVE_PGUSER>";

export const FINAL_VERIFICATION_COMMAND_PORTFOLIO = Object.freeze([
  "npm ci --ignore-scripts --no-audit --no-fund",
  "npm ls --all",
  "git diff --check",
  "npm audit --omit=dev --audit-level=low",
  "npm run test:security:scan-release",
  "npm run security:scan-release",
  "node scripts/test-final-verification-runner-contract.mjs",
  "npm run test:release-evidence-current",
  "npm run lint",
  "npm run typecheck",
  "npm run build",
  "npm run test:zero-external-effects",
  "npm run test:e2e:safe:contract",
  "npm run test:e2e:safe:reporter",
  "npm run test:e2e:safe:list",
  "npm run test:e2e:safe",
  "npm run test:load:safe-local:contract",
  "npm run load:safe-local",
  "npm run test:dealflow-completion",
  "npm run test:media-buyer",
  "npm run test:media-buying-upgrades",
  "npm run test:media-buyer-regression",
  "npm run test:static-ad-templates",
  "npm run test:creative-content-integrity",
  "npm run test:homepage",
  "npm run test:access-key-checkout-signup",
  "npm run test:public-funnel-thank-you",
  "npm run test:public-funnel-language",
  "npm run test:single-plan-ui",
  "npm run test:white-label-host-binding",
  "npm run test:ghl-signed-user-context",
  "npm run test:white-label-attribution-db",
  "npm run test:white-label-universal",
  "npm run test:product-localization",
  "npm run test:production-route-contract",
  "npm run smoke:offline",
  "npm run plan:validate",
  "npm run plan:writes:check",
  "npm run schema:check",
  "npm run routes:security",
  "node scripts/check-tenant-isolation.mjs",
  "node scripts/test-migration-read-only-contract.mjs",
  "npm run test:release-guard",
  "npm run test:stripe-runtime-mode",
  "npm run test:disposable-postgres-harness",
  NATIVE_POSTGRES_COMMAND_TEMPLATE,
  "node scripts/test-campaign-execution-tenant-contract.mjs",
  "node scripts/test-ghl-booking-handoff-contract.mjs",
  "npm run test:ghl-sandbox",
  "npm run test:ghl-production",
  "npm run test:ghl-lifecycle",
  "npm run test:ghl-inbound-reconciliation",
  "npm run test:ghl-inbound-authority",
  "npm run test:ghl-inbound-reconciliation-db",
  "npm run test:ghl-launch-readiness",
  "npm run test:ghl-write-ambiguity",
  "npm run test:ghl-periodic-form-sweep",
  "npm run test:ghl-periodic-form-sweep-db",
  "node scripts/test-ghl-destination-fail-closed.mjs",
  "node scripts/test-isolated-staging-seed-contract.mjs",
  "npm run test:staging-migration-broker-contract",
  "npm run test:staging-acceptance-contract",
  "npm run test:system-job-stage-isolation",
  "npm run test:reporting-worker-capacity",
  "npm run test:campaign-dashboard-metric-truth",
  "npm run test:dashboard-lineage-db",
  "npm run test:atomic-public-lead-capture-db",
  "npm run test:paid-creative-dispatch",
  "npm run test:generated-video-storage",
  "npm run test:account-deletion-offboarding",
  "node scripts/test-meta-budget-safety.mjs",
  "node scripts/generate-forward-migration-portfolio.mjs --check",
  "node scripts/schema/check-forward-reconstruction.mjs",
  "npm run test:schema-oracle-contract",
  "npm run test:schema-reconciliation-db",
  "npm run test:integrated-migration-chain-db",
  "npm run test:meta-campaign-activation",
  "npm run test:meta-optimization-executor",
  "npm run test:access-key-security-disposable-db",
  "npm run test:meta-leadgen",
  "npm run test:financial-integrity-disposable-db",
  "npm run test:stripe-webhook-disposable-db",
  "npm run test:scheduler-disposable-db",
  "npm run test:creative-lead-disposable-db",
  "npm run test:ghl-disposable-db",
  "npm run test:lead-effect-fencing-db",
  "npm run test:campaign-entitlement-disposable-db",
  "npm run test:support-outbox-disposable-db",
  "npm run test:sms-receipts",
  "node scripts/test-lead-tracking-health.mjs",
]);

export const FINAL_VERIFICATION_COMMAND_COUNT = 90;
export const FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256 =
  "2fb17463fa839abac369c1dddd4614cae7c2e1b3520a67e06addacd8a7637a5d";
export const FINAL_VERIFICATION_HOSTED_DEFERRALS = Object.freeze([
  "npm run rls:cross-tenant",
  "npm run rls:fixture-smoke",
  "npm run operator:debt",
]);

const SPECIAL_EVIDENCE_QUALIFICATIONS = Object.freeze({
  "npm run test:e2e:safe": "local_public_pass_authenticated_deferred",
  "npm run schema:check": "local_migration_inventory_only_remote_schema_deferred",
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fail(label) {
  throw new Error(`${label} does not match the exact final-verification command contract`);
}

function normalizeNativePostgresRuntime(runtime, label) {
  const pgbin = runtime?.pgbin;
  const host = runtime?.host;
  const rawPort = runtime?.port;
  const user = runtime?.user;
  const port = Number(rawPort);
  if (
    typeof pgbin !== "string" ||
    !isAbsolute(pgbin) ||
    /[\s\u0000-\u001f\u007f]/u.test(pgbin) ||
    typeof host !== "string" ||
    !isAbsolute(host) ||
    /[\s\u0000-\u001f\u007f]/u.test(host) ||
    typeof rawPort !== "string" ||
    !Number.isInteger(port) ||
    port < 1_024 ||
    port > 65_535 ||
    String(port) !== String(rawPort) ||
    typeof user !== "string" ||
    !/^[a-z_][a-z0-9_]{0,62}$/.test(user)
  ) {
    fail(label);
  }
  return Object.freeze({ pgbin, host, port: String(port), user });
}

function renderNativePostgresCommand(runtime) {
  return (
    `${NATIVE_POSTGRES_COMMAND_PREFIX} ` +
    `--pgbin ${runtime.pgbin} ` +
    `--host ${runtime.host} ` +
    `--port ${runtime.port} ` +
    `--user ${runtime.user}`
  );
}

export function extractFinalVerificationNativePostgresRuntime(
  commands,
  label = "Final-verification native PostgreSQL runtime",
) {
  if (
    !Array.isArray(commands) ||
    commands.length !== FINAL_VERIFICATION_COMMAND_COUNT
  ) {
    fail(label);
  }
  const command = commands[NATIVE_POSTGRES_COMMAND_INDEX];
  if (typeof command !== "string") fail(label);
  const match = new RegExp(
    `^${NATIVE_POSTGRES_COMMAND_PREFIX.replaceAll(".", "\\.")} ` +
      "--pgbin ([^\\s]+) --host ([^\\s]+) --port ([^\\s]+) --user ([^\\s]+)$",
  ).exec(command);
  if (!match) fail(label);
  const runtime = normalizeNativePostgresRuntime(
    { pgbin: match[1], host: match[2], port: match[3], user: match[4] },
    label,
  );
  if (renderNativePostgresCommand(runtime) !== command) fail(label);
  return runtime;
}

export function createFinalVerificationCommandPortfolio(nativePostgresRuntime) {
  const runtime = normalizeNativePostgresRuntime(
    nativePostgresRuntime,
    "Final-verification native PostgreSQL runtime",
  );
  const commands = [...FINAL_VERIFICATION_COMMAND_PORTFOLIO];
  commands[NATIVE_POSTGRES_COMMAND_INDEX] = renderNativePostgresCommand(runtime);
  return Object.freeze(commands);
}

export function formatFinalVerificationCommandTuple(tuple) {
  if (
    !Array.isArray(tuple) ||
    tuple.length !== 2 ||
    typeof tuple[0] !== "string" ||
    !Array.isArray(tuple[1]) ||
    tuple[1].some((argument) => typeof argument !== "string")
  ) {
    fail("Final-verification command definition");
  }
  return [tuple[0], ...tuple[1]].join(" ");
}

export function finalVerificationEvidenceQualification(command) {
  return SPECIAL_EVIDENCE_QUALIFICATIONS[command] ?? "exact_local_command";
}

export function assertExactFinalVerificationCommandPortfolio(
  commands,
  label = "Final-verification command portfolio",
  expectedNativePostgresRuntime,
) {
  const canonicalCommands = Array.isArray(commands) ? [...commands] : null;
  if (canonicalCommands?.length === FINAL_VERIFICATION_COMMAND_COUNT) {
    extractFinalVerificationNativePostgresRuntime(canonicalCommands, label);
    canonicalCommands[NATIVE_POSTGRES_COMMAND_INDEX] =
      NATIVE_POSTGRES_COMMAND_TEMPLATE;
  }
  if (
    !Array.isArray(commands) ||
    commands.length !== FINAL_VERIFICATION_COMMAND_COUNT ||
    commands.some((command) => typeof command !== "string") ||
    JSON.stringify(canonicalCommands) !==
      JSON.stringify(FINAL_VERIFICATION_COMMAND_PORTFOLIO) ||
    sha256(JSON.stringify(canonicalCommands)) !==
      FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256
  ) {
    fail(label);
  }
  if (
    expectedNativePostgresRuntime !== undefined &&
    JSON.stringify(commands) !==
      JSON.stringify(
        createFinalVerificationCommandPortfolio(expectedNativePostgresRuntime),
      )
  ) {
    fail(label);
  }
  return Object.freeze({
    commandCount: FINAL_VERIFICATION_COMMAND_COUNT,
    commandPortfolioSha256: FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256,
    resolvedCommandPortfolioSha256: sha256(JSON.stringify(commands)),
  });
}

export function assertExactFinalVerificationRecordPortfolio(
  records,
  label = "Final-verification record portfolio",
) {
  if (!Array.isArray(records)) fail(label);
  const portfolio = assertExactFinalVerificationCommandPortfolio(
    records.map((record) => record?.command),
    label,
  );
  if (
    records.some(
      (record) =>
        record?.evidenceQualification !==
        finalVerificationEvidenceQualification(record?.command),
    )
  ) {
    fail(label);
  }
  return portfolio;
}

export function assertExactFinalVerificationSummaryPortfolio(
  summary,
  label = "Final-verification summary portfolio",
) {
  if (
    !summary ||
    summary.plannedCommandCount !== FINAL_VERIFICATION_COMMAND_COUNT ||
    summary.commandCount !== FINAL_VERIFICATION_COMMAND_COUNT ||
    summary.passedCount !== FINAL_VERIFICATION_COMMAND_COUNT ||
    summary.commandPortfolioSha256 !== FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256 ||
    summary.minimumFreeBytesRequired !== FINAL_VERIFICATION_MINIMUM_FREE_BYTES ||
    !Number.isSafeInteger(summary.minimumObservedFreeBytes) ||
    summary.minimumObservedFreeBytes < FINAL_VERIFICATION_MINIMUM_FREE_BYTES ||
    summary.fatalResourceDiagnosticCount !== 0 ||
    summary.evidenceTreeStatus !== "PASS" ||
    !Number.isSafeInteger(summary.evidenceTreeFileCountBeforeSummary) ||
    summary.evidenceTreeFileCountBeforeSummary <= 0 ||
    !/^[a-f0-9]{64}$/.test(summary.evidenceTreeSha256BeforeSummary ?? "") ||
    summary.localBrowserEvidenceStatus !== "EXACT_40_NONEMPTY_SCREENSHOTS" ||
    summary.localBrowserScreenshotCount !==
      FINAL_VERIFICATION_LOCAL_BROWSER_SCREENSHOT_COUNT ||
    JSON.stringify(summary.localBrowserProjectScreenshotCounts) !==
      JSON.stringify(
        Object.fromEntries(
          FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS.map((project) => [
            project,
            FINAL_VERIFICATION_LOCAL_BROWSER_PASSED_PER_PROJECT,
          ]),
        ),
      ) ||
    summary.blockedCount !== FINAL_VERIFICATION_HOSTED_DEFERRALS.length ||
    summary.environmentOnlyDeferredCount !== FINAL_VERIFICATION_HOSTED_DEFERRALS.length ||
    !Array.isArray(summary.environmentOnlyDeferrals) ||
    JSON.stringify(summary.environmentOnlyDeferrals.map((item) => item?.command)) !==
      JSON.stringify(FINAL_VERIFICATION_HOSTED_DEFERRALS) ||
    summary.environmentOnlyDeferrals.some(
      (item) => item?.status !== "authenticated_deferred",
    ) ||
    summary.localGateStatus !== "NO_GO_AUTHENTICATED_PROOF_DEFERRED" ||
    summary.stagingAdvancementAuthorized !== false ||
    summary.exactSealCommandPortfolioStatus !==
      "passed_with_mandatory_hosted_proof_blockers" ||
    summary.authenticatedBrowserStatus !==
      "authenticated_deferred_to_isolated_hosted_staging" ||
    summary.remoteSchemaStatus !==
      "authenticated_deferred_to_isolated_hosted_staging" ||
    !Array.isArray(summary.records) ||
    summary.records.length !== FINAL_VERIFICATION_COMMAND_COUNT
  ) {
    fail(label);
  }
  const portfolio = assertExactFinalVerificationRecordPortfolio(summary.records, label);
  if (
    summary.resolvedCommandPortfolioSha256 !==
    portfolio.resolvedCommandPortfolioSha256
  ) {
    fail(label);
  }
  const workingDirectories = new Set(
    summary.records.map((record) => record?.workingDirectory),
  );
  const logNames = new Set(summary.records.map((record) => record?.log));
  if (
    workingDirectories.size !== 1 ||
    typeof summary.records[0]?.workingDirectory !== "string" ||
    !summary.records[0].workingDirectory.startsWith("/") ||
    logNames.size !== FINAL_VERIFICATION_COMMAND_COUNT ||
    summary.records.some(
      (record, index) =>
        record?.status !== "passed" ||
        record?.exitCode !== 0 ||
        record?.fatalResourceDiagnostic !== null ||
        record?.postCommandDiskHeadroom !== "passed" ||
        !Number.isSafeInteger(record?.diskFreeBytesBefore) ||
        record.diskFreeBytesBefore < FINAL_VERIFICATION_MINIMUM_FREE_BYTES ||
        !Number.isSafeInteger(record?.diskFreeBytesAfter) ||
        record.diskFreeBytesAfter < FINAL_VERIFICATION_MINIMUM_FREE_BYTES ||
        record?.postCommandRepositoryInvariant !== "passed" ||
        record?.safeEnvironmentProfile !==
          "provider_credentials_and_application_secrets_omitted" ||
        record?.headCommit !== summary.headCommit ||
        record?.headTree !== summary.headTree ||
        record?.trackedWorktreeSha256 !== summary.trackedWorktreeSha256 ||
        record?.trackedFileCount !== summary.trackedFileCount ||
        record?.dependencyLockSha256 !== summary.dependencyLockSha256 ||
        record?.migrationCount !== summary.migrationCount ||
        record?.migrationPortfolioSha256 !== summary.migrationPortfolioSha256 ||
        typeof record?.log !== "string" ||
        !new RegExp(`^${String(index + 1).padStart(2, "0")}-[a-z0-9-]+\\.log$`).test(
          record.log,
        ),
    )
  ) {
    fail(label);
  }
  return portfolio;
}

if (
  FINAL_VERIFICATION_COMMAND_PORTFOLIO.length !== FINAL_VERIFICATION_COMMAND_COUNT ||
  sha256(JSON.stringify(FINAL_VERIFICATION_COMMAND_PORTFOLIO)) !==
    FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256
) {
  throw new Error("The tracked final-verification command contract is internally inconsistent");
}
