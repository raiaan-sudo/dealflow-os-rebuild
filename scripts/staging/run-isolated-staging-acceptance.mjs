#!/usr/bin/env node

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { assertExactFinalVerificationSummaryPortfolio } from "../lib/final-verification-command-contract.mjs";
import { assertFinalVerificationEvidenceIsSealable } from "../lib/final-verification-evidence-contract.mjs";
import {
  RLS_FIXTURE_DIRECT_MARKERS,
  RLS_FIXTURE_LEGACY_IMMUTABLE_MARKERS,
  applyRlsFixtureMarker,
  isRlsFixtureAuthEmail,
} from "../lib/rls-fixture-contract.mjs";

import {
  isExactCurrentResumeIdentity,
  isExactSafeStagingAuthSurfaceProof,
} from "./prior-migration-proof-contract.mjs";
import {
  StagingHostRedirectError,
  classifyStagingHostReadiness,
  configureExactStagingVercelProtection,
  verifyExactStagingVercelProtection,
} from "./vercel-staging-protection-contract.mjs";
import {
  EXACT_ALIAS_PROPAGATION_POLL_INTERVAL_MS,
  EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS,
  EXACT_ALIAS_PROPAGATION_TIMEOUT_MS,
  ExactAliasPropagationTimeoutError,
  classifyExactVercelAutomationProtectionRedirect,
  proveSequentialExactApplicationGate,
  summarizeExactAliasPropagationFailure,
  waitForExactAliasPropagation,
  waitForExactAliasRollbackContainment,
} from "./vercel-alias-propagation-contract.mjs";
import {
  SYNTHETIC_BROWSER_SESSION_BUNDLE_SCHEMA,
  SYNTHETIC_STAGING_ROLE_EMAILS,
  validateSyntheticBrowserCookieChunks,
} from "./browser-session-bundle-contract.mjs";
import { SYNTHETIC_PROVIDER_SESSION_BUNDLE_SCHEMA } from "./provider-session-bundle-contract.mjs";
import {
  UNSEALED_PLAYWRIGHT_FAILURE_POLICY,
  deleteRegisteredUnsealedPlaywrightArtifactDirectories,
} from "./unsealed-playwright-artifact-cleanup.mjs";
import {
  buildMinimalPlaywrightFailureDiagnostic,
  buildPlaywrightFailureDiagnostic,
} from "./playwright-failure-diagnostic-contract.mjs";
import { runInterruptibleCommand } from "./interruptible-command.mjs";
import { assertApprovedStagingEvidenceRootPath } from "./staging-evidence-root-contract.mjs";
import { parseExactHostedSupabaseProjectUrl } from "./exact-supabase-project-url.mjs";
import { assertExactDeployableSourcePathSet } from "./deployable-source-path-set-contract.mjs";
import { assertExactVercelDryRunSourcePortfolio } from "./vercel-dry-run-source-contract.mjs";
import { assertExactHostedBuildSourceIdentity } from "./hosted-build-source-identity-contract.mjs";
import { findExactNextStaticChunkPath } from "./next-static-chunk-path.mjs";
import {
  APPROVED_DIRECT_PUBLIC_IMAGE_ASSETS,
  assertExactStagingImageBuildInputInventory,
} from "./staging-image-build-input-contract.mjs";
import {
  assertExactApprovedDirectPublicImageMatrixCheckpoint,
  buildApprovedDirectPublicImageMatrixCheckpoint,
  evaluateApprovedDirectPublicImageSixModeMatrix,
  sanitizeApprovedDirectPublicImageEdgeCache,
  writeAtomicApprovedDirectPublicImageMatrixCheckpoint,
} from "./approved-direct-public-image-checkpoint-contract.mjs";
import {
  assertExactNextImageOptimizerSixModeMatrix,
  classifyExactNextImageOptimizerRejection,
} from "./staging-image-optimizer-response-contract.mjs";
import {
  assertExactCandidateDeployedImagePortfolioConfiguration,
  summarizeDeployedImageConfiguration,
} from "./vercel-deployed-image-config-contract.mjs";
import {
  assertPinnedVercelCliUnchanged,
  disposePinnedVercelCli,
  resolvePinnedVercelCli,
} from "./vercel-cli-selection-contract.mjs";
import { synchronizeExactVercelEnvironment } from "./vercel-environment-sync-contract.mjs";
import { FORWARD_104_TO_120_AUTHORITY } from "./forward-104-to-120-contract.mjs";
import { FORWARD_122_TO_123_AUTHORITY } from "./forward-122-to-123-contract.mjs";

const EXPECTED_REPO = realpathSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
);
const EXPECTED_BRANCH = "codex/dealflow-release-closure-plan";
const EXPECTED_STAGING_HOST = "dealflow-os-rebuild-selfserve-clean.vercel.app";
const EXPECTED_STAGING_BASE_URL = `https://${EXPECTED_STAGING_HOST}`;
const EXPECTED_PARTNER_ONE_HOST =
  "dealflow-os-rebuild-selfserve-clean-partner-one-qibh.vercel.app";
const EXPECTED_PARTNER_ONE_BASE_URL = `https://${EXPECTED_PARTNER_ONE_HOST}`;
const EXPECTED_SECOND_PARTNER_HOST =
  "dealflow-os-rebuild-selfserve-clean-partner-two-qibh.vercel.app";
const EXPECTED_SECOND_PARTNER_BASE_URL = `https://${EXPECTED_SECOND_PARTNER_HOST}`;
const EXPECTED_APP_ALIASES = Object.freeze([
  Object.freeze({ label: "stable_direct", host: EXPECTED_STAGING_HOST, url: EXPECTED_STAGING_BASE_URL }),
  Object.freeze({ label: "partner_one", host: EXPECTED_PARTNER_ONE_HOST, url: EXPECTED_PARTNER_ONE_BASE_URL }),
  Object.freeze({ label: "partner_two", host: EXPECTED_SECOND_PARTNER_HOST, url: EXPECTED_SECOND_PARTNER_BASE_URL }),
]);
const EXPECTED_SUPABASE_FINGERPRINT =
  "c4d7f6ba9f2c678101b45b453998c4fa5755d8ec038f6cfd3ca8de957a0d1f4c";
const EXPECTED_SUPABASE_SAFE_SUFFIX = "qibh";
const EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT =
  "d0fa02eaf7e533f2a17a0b87c039c6a1686e5467840d2b8c2f2dca2758d95fde";
const EXPECTED_VERCEL_ORG_ID_FINGERPRINT =
  "0f12b45f2ccfe002e7aaea8d857a6034b16684d6fa6ba5013f80dc8635fe9146";
const EXPECTED_VERCEL_PROJECT_NAME = "dealflow-os-rebuild-selfserve-clean";
const EXPECTED_QA_EMAIL = "dealflow-staging-qa-harness-20260712@example.com";
const EXPECTED_OPERATOR_EMAIL = "dealflow-staging-operator-20260712@example.com";
const EXPECTED_MIGRATION_COUNT = 125;
const EXPECTED_FINAL_MIGRATION =
  "20260722040000_add_service_only_operator_grant_probe.sql";
const EXPECTED_HOSTED_ENVIRONMENT_NAME_SET_SHA256 =
  "92e1e9b756b7a9aca9a7db5daaf68d7ae93d68368f33fc1fd787024a1a099802";
const EXECUTION_AUTHORIZATION = "AUTHORIZE_ISOLATED_STAGING_ACCEPTANCE_V1";
const EXPECTED_LOCAL_GATE_STATUS = "NO_GO_AUTHENTICATED_PROOF_DEFERRED";
const EXPECTED_HOSTED_DEFERRALS = Object.freeze([
  "npm run operator:debt",
  "npm run rls:cross-tenant",
  "npm run rls:fixture-smoke",
]);
const ZERO_EXTERNAL_EFFECTS_ATTESTATION =
  "DEALFLOW_ISOLATED_STAGING_QIBH_ZERO_EXTERNAL_EFFECTS_V1";
const HOSTED_RELEASE_IDENTITY_SCHEMA = "dealflow.hosted-release-identity.v2";
const STAGING_ACCESS_HEADER = "x-dealflow-staging-access";
const STAGING_ACCESS_COOKIE = "__Host-dealflow-staging-access";
const VERCEL_PROTECTION_BYPASS_HEADER = "x-vercel-protection-bypass";
const STAGING_PRIVATE_IMAGE_SOURCE_PATH_PREFIX =
  "/staging-private-image-gate-proof-v2/";
const RETIRED_PUBLIC_IMAGE_SOURCE_PATH =
  "/staging-image-optimizer-proof.png";
const NEXT_IMAGE_OPTIMIZER_PATH = "/_next/image";
const VERCEL_NATIVE_IMAGE_OPTIMIZER_PATH = "/_vercel/image";
const DISABLED_STAGING_IMAGE_OPTIMIZER_PATH =
  "/_dealflow-staging-image-optimizer-disabled";
const OPEN_GRAPH_IMAGE_SOURCE_PATH = "/opengraph-image";
const INVALID_SIGNED_PROVIDER_IMAGE_SOURCE_PATH =
  "/api/provider-media/higgsfield-source/00000000-0000-4000-8000-000000000000";
const STAGING_PRIVATE_IMAGE_SOURCE_BODY_BYTES = 210;
const STAGING_PRIVATE_IMAGE_SOURCE_BODY_SHA256 =
  "79e21c735b4f029f2995a86f3619ab9eb6ca501898ff0467d545cef2f09594d8";
const DEALFLOW_NOT_FOUND_BODY_BYTES = 22;
const DEALFLOW_NOT_FOUND_BODY_SHA256 =
  "58e46b31fc6d69e3ecdb843eeff8bac8d49c9a70cdac583c73986a8a4fb5d1b0";
const APPROVED_DIRECT_PUBLIC_IMAGE_GATE_CHECKPOINT_CONTRACT = Object.freeze({
  status: 404,
  contentType: "application/json",
  bodyBytes: DEALFLOW_NOT_FOUND_BODY_BYTES,
  bodySha256: DEALFLOW_NOT_FOUND_BODY_SHA256,
});
const EXACT_HOSTED_DIRECT_PUBLIC_IMAGE_CONTENT_TYPE_BY_IDENTITY = Object.freeze({
  "86ec6b7627602d55faf7bf792d30d07479814ec6debb4879816f9520d89263bf":
    "image/vnd.microsoft.icon",
  "2b67812c325c199a02536cdbeea0c593a72f707d323b72ee3e08dbab06753bd4":
    "image/svg+xml",
  "b614b9bf183925957661ac851498fe1d8029fd43a62fbfed86f9e2624a57e7cf":
    "image/svg+xml",
  "ba4f77e1153124a9163a1a47a4a239b2acfc7e0e3b7585db16747a03a135c0ad":
    "image/svg+xml",
  "3a3a19379014f26a3e6734c27b371b9e508b2e4fb41294321b8474a4a4ebf62f":
    "image/svg+xml",
  "55995dfad6ecb4945a1e856ddca03c5e16aa5bf13fd21b4df6a74ae79357bcfc":
    "image/svg+xml",
  "f081337b2fee635b455b63275406a3e7f39d6a014e25ad90dab5a67e62a12ac4":
    "image/svg+xml",
  "644768c4aaeb4767bce293344eeb0c125fb804a94d801440424072202d85e3a1":
    "image/svg+xml",
});
const PRIVATE_IMAGE_ROUTE_NOT_FOUND_BODY_BYTES = 10;
const PRIVATE_IMAGE_ROUTE_NOT_FOUND_BODY_SHA256 =
  "0802559db1375af3ff5caabba71acea1d6299f1a7fc64b6a5024f19cbd33b72f";
const INVALID_SIGNED_PROVIDER_IMAGE_BODY_BYTES = 38;
const INVALID_SIGNED_PROVIDER_IMAGE_BODY_SHA256 =
  "2d24047265df34202b8968cbc26cc0dc8549ad16cc3aea707c2034c0441eded5";
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
const EXPECTED_DATABASE_TRUST_BUNDLE_PATH = join(
  EXPECTED_REPO,
  "config",
  "security",
  "supabase-prod-ca-2021.crt",
);
const DEPLOYABLE_SOURCE_MANIFEST_PATH = join(
  EXPECTED_REPO,
  "config",
  "release",
  "deployable-source-manifest.json",
);
const EXPECTED_DATABASE_TRUST_BUNDLE_SHA256 =
  "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7";
const EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT = 61;
const PAID_CAMPAIGN_ID = "d2000000-0000-4000-8000-000000000001";
const PAID_ORGANIZATION_ID = "d1000000-0000-4000-8000-000000000001";
const PAID_BILLING_ID = "d6000000-0000-4000-8000-000000000001";
const ATTACKER_ORGANIZATION_ID = "d1000000-0000-4000-8000-000000000011";
const ATTACKER_EMAIL = "dealflow-staging-attacker-20260712@example.com";
const DELETION_ORGANIZATION_ID = "d1000000-0000-4000-8000-000000000019";
const DELETION_EMAIL = "dealflow-staging-deletion-20260712@example.com";
const PUBLIC_FUNNEL_SLUG = "df-staging-20260712-funnel";
const STAGING_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
const STAGING_TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
const STAGING_TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const SYNTHETIC_SESSION_PORTFOLIO_SCHEMA =
  "dealflow.synthetic-staging-session-portfolio.v1";
const SYNTHETIC_PLATFORM_OPERATOR_CAPABILITY =
  "platform_admin_security_surface";
const SYNTHETIC_PLATFORM_OPERATOR_DECISION_ID =
  "OWNER-ADMIN-SECURITY-SURFACE";
const SYNTHETIC_RLS_PROOF_ROLES = Object.freeze([
  "paidDirect",
  "attacker",
]);
const SYNTHETIC_PROVIDER_PROOF_ROLES = Object.freeze([
  "paidDirect",
  "partnerChild",
  "partnerChildTwo",
]);
const SYNTHETIC_MULTI_ROLE_BROWSER_ROLES = Object.freeze(
  Object.keys(SYNTHETIC_STAGING_ROLE_EMAILS).sort(),
);
const SYNTHETIC_SAFE_BROWSER_ROLES = Object.freeze(["paidDirect"]);
const EXECUTABLE = process.execPath;
const failureContext = {
  evidenceDir: null,
  stage: "startup",
  identity: null,
  sealCompleted: false,
  transientSecrets: [],
  pendingSyntheticUserGlobalSignOuts: [],
  unsealedPlaywrightArtifactDirectories: [],
  playwrightFailureDiagnosticFallback: null,
  stagingAliasMutations: [],
  vercelSelection: null,
};
const executionAbortController = new AbortController();
const activeInterruptibleCommands = new Set();
let terminationRequested = false;
let terminationRequest = null;
let approvedStagingEvidenceParent = null;
let resolveTerminationRequest;
const terminationRequestPromise = new Promise((resolvePromise) => {
  resolveTerminationRequest = resolvePromise;
});

function assertExecutionMayContinue() {
  if (terminationRequested || executionAbortController.signal.aborted) {
    throw terminationRequest?.error ?? new Error("Staging acceptance termination is in progress");
  }
}

function requestExecutionTermination(
  reason,
  { terminationKind = "controlled_termination", exitCode = 1 } = {},
) {
  if (terminationRequest) return terminationRequest;
  const error = reason instanceof Error ? reason : new Error(String(reason));
  terminationRequested = true;
  terminationRequest = Object.freeze({ error, terminationKind, exitCode });
  if (!executionAbortController.signal.aborted) {
    executionAbortController.abort(error);
  }
  resolveTerminationRequest(terminationRequest);
  return terminationRequest;
}

async function drainInterruptibleCommands() {
  while (activeInterruptibleCommands.size > 0) {
    await Promise.allSettled([...activeInterruptibleCommands]);
  }
}

function combinedAbortSignal({ signal, timeoutMs = 30_000, allowDuringTermination = false } = {}) {
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (signal) signals.push(signal);
  if (!allowDuringTermination) signals.push(executionAbortController.signal);
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}

function executionFetch(input, init = {}, timeoutMs = 30_000) {
  assertExecutionMayContinue();
  return fetch(input, {
    ...init,
    signal: combinedAbortSignal({ signal: init.signal, timeoutMs }),
  });
}

function cleanupFetch(input, init = {}, timeoutMs = 10_000) {
  return fetch(input, {
    ...init,
    signal: combinedAbortSignal({
      signal: init.signal,
      timeoutMs,
      allowDuringTermination: true,
    }),
  });
}

async function abortableDelay(delayMs) {
  assertExecutionMayContinue();
  await new Promise((resolvePromise, reject) => {
    let timeout;
    const finish = () => {
      executionAbortController.signal.removeEventListener("abort", onAbort);
      resolvePromise();
    };
    const onAbort = () => {
      clearTimeout(timeout);
      reject(terminationRequest?.error ?? new Error("Staging acceptance terminated"));
    };
    timeout = setTimeout(finish, delayMs);
    executionAbortController.signal.addEventListener("abort", onAbort, { once: true });
    if (executionAbortController.signal.aborted) onAbort();
  });
  assertExecutionMayContinue();
}

async function cleanupDelay(delayMs) {
  if (
    !Number.isSafeInteger(delayMs) ||
    delayMs < 1 ||
    delayMs > EXACT_ALIAS_PROPAGATION_TIMEOUT_MS
  ) {
    throw new Error("Cleanup delay is outside the bounded alias propagation contract");
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
}
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
  "GHL_MARKETPLACE_PROVIDER_EFFECTS_ENABLED",
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
  "STAGING_ACCESS_GATE_SECRET",
  "TURNSTILE_SECRET_KEY",
  "GHL_APP_SHARED_SECRET",
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
    --evidence-dir /absolute/external/dealflow-staging-acceptance-evidence-<seal> \\
    --round-one /absolute/path/final-verification-round-1.json \\
    --round-two /absolute/path/final-verification-round-2.json

Safe resume after a previously sealed atomic application:
  node scripts/staging/run-isolated-staging-acceptance.mjs \\
    --execute --verify-existing-migrations --deploy \\
    --prior-migration-proof-dir /absolute/path/prior/migration-proof \\
    --evidence-dir /absolute/external/dealflow-staging-acceptance-evidence-<new-seal> \\
    --round-one /absolute/path/final-verification-round-1.json \\
    --round-two /absolute/path/final-verification-round-2.json

Historical bounded forward transition from the pinned read-only-proven
104-migration staging seal to the sealed 120-migration predecessor:
  node scripts/staging/run-isolated-staging-acceptance.mjs \\
    --execute --apply-forward-migration --deploy \\
    --prior-migration-proof-dir /absolute/path/pinned-104/migration-proof \\
    --evidence-dir /absolute/external/dealflow-staging-acceptance-evidence-<new-seal> \\
    --round-one /absolute/path/final-verification-round-1.json \\
    --round-two /absolute/path/final-verification-round-2.json

Historical bounded successor transition from the sealed 122-migration predecessor
to the sealed 123-migration portfolio (not executable by the current candidate):
  node scripts/staging/run-isolated-staging-acceptance.mjs \\
    --execute --apply-successor-migration --deploy \\
    --prior-migration-proof-dir /absolute/path/pinned-122/migration-proof \\
    --evidence-dir /absolute/external/dealflow-staging-acceptance-evidence-<new-seal> \\
    --round-one /absolute/path/final-verification-round-1.json \\
    --round-two /absolute/path/final-verification-round-2.json

Required execution environment:
  DEALFLOW_STAGING_ACCEPTANCE_AUTHORIZATION=${EXECUTION_AUTHORIZATION}
  VERCEL_CLI_JS=/absolute/canonical/path/to/node_modules/vercel/dist/index.js
  VERCEL_CLI_SHA256=<independently pinned lowercase entry-file SHA-256>
  VERCEL_CLI_INSTALLATION_SHA256=<independently pinned lowercase full-installation SHA-256>
  DEALFLOW_STAGING_EVIDENCE_PARENT=/absolute/durable/owner-only/evidence-parent
  DEALFLOW_STAGING_PROJECT_RECORD=/absolute/external/owner-only-qibh-project-record.json
  Exact isolated qibh Supabase credentials, staging QA secrets, and fail-closed provider flags.

Exactly one migration mode is required. Resume mode is read-only. Historical
104-to-120 and 122-to-123 transitions remain immutable proof and cannot be run
from the current 125-migration checkout; use fresh apply or exact-existing
read-only verification.`;
}

function parseArguments(argv) {
  const options = {
    execute: false,
    applyMigrations: false,
    applyForwardMigration: false,
    applySuccessorMigration: false,
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
    else if (arg === "--apply-successor-migration") options.applySuccessorMigration = true;
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

function captureExactStagingProjectRecord(expectedProjectRef) {
  const suppliedPath = requiredEnvironment("DEALFLOW_STAGING_PROJECT_RECORD");
  if (!isAbsolute(suppliedPath)) {
    throw new Error("DEALFLOW_STAGING_PROJECT_RECORD must be an absolute path");
  }
  const path = resolve(suppliedPath);
  if (!existsSync(path)) {
    throw new Error("The isolated staging project record is unavailable");
  }
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o077) !== 0 ||
    stat.uid !== process.getuid() ||
    stat.size <= 0 ||
    stat.size > 64 * 1024 ||
    realpathSync(path) !== path
  ) {
    throw new Error(
      "The isolated staging project record must be an owner-only real file",
    );
  }
  const relation = relative(EXPECTED_REPO, path);
  if (
    relation === "" ||
    (!relation.startsWith(`..${sep}`) && relation !== "..")
  ) {
    throw new Error("The isolated staging project record must remain outside the release repository");
  }
  const record = JSON.parse(readFileSync(path, "utf8"));
  const projectRef = String(record.ref ?? "").trim().toLowerCase();
  if (
    projectRef !== expectedProjectRef ||
    record.name !== "dealflow-staging-20260712" ||
    (record.status !== "ACTIVE_HEALTHY" && record.status !== "ACTIVE") ||
    projectRef.slice(-4) !== EXPECTED_SUPABASE_SAFE_SUFFIX ||
    sha256(projectRef) !== EXPECTED_SUPABASE_FINGERPRINT
  ) {
    throw new Error("The exact isolated staging project record is invalid");
  }
  return Object.freeze({
    path,
    evidence: Object.freeze({
      status: "PASS",
      projectFingerprint: EXPECTED_SUPABASE_FINGERPRINT,
      safeSuffix: EXPECTED_SUPABASE_SAFE_SUFFIX,
      ownerOnly: true,
      outsideReleaseRepository: true,
      pathPersisted: false,
    }),
  });
}

function captureApprovedStagingEvidenceParent(evidenceDir) {
  const suppliedParent = requiredEnvironment(
    "DEALFLOW_STAGING_EVIDENCE_PARENT",
  );
  const exactEvidencePath = assertApprovedStagingEvidenceRootPath(evidenceDir, {
    approvedParent: suppliedParent,
  });
  const parent = dirname(exactEvidencePath);
  const ephemeralRoots = ["/tmp", "/private/tmp", "/var/tmp"]
    .filter((path) => existsSync(path))
    .map((path) => realpathSync(path));
  if (
    ephemeralRoots.some(
      (root) => parent === root || parent.startsWith(`${root}${sep}`),
    )
  ) {
    throw new Error("Isolated staging evidence requires a durable non-temporary parent");
  }
  const relation = relative(EXPECTED_REPO, parent);
  if (
    relation === "" ||
    (!relation.startsWith(`..${sep}`) && relation !== "..")
  ) {
    throw new Error(
      "Isolated staging evidence parent must remain outside the release repository",
    );
  }
  return parent;
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
    .replace(
      /(\"name\"\s*:\s*\"sb-[a-z0-9-]+-auth-token(?:\.\d+)?\"\s*,\s*\"value\"\s*:\s*\")[^\"]+/gi,
      "$1[REDACTED_AUTH_COOKIE]",
    )
    .replace(
      /sb-[a-z0-9-]+-auth-token(?:\.\d+)?\s*=\s*(?:base64-)?[A-Za-z0-9_-]{24,}/gi,
      "sb-[REDACTED]-auth-token=[REDACTED_AUTH_COOKIE]",
    )
    .replace(/\bbase64-[A-Za-z0-9_-]{24,}/g, "[REDACTED_SSR_AUTH_COOKIE]")
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

async function runInterruptible(command, args, options = {}) {
  assertExecutionMayContinue();
  const execution = runInterruptibleCommand({
    command,
    args,
    cwd: options.cwd ?? EXPECTED_REPO,
    env: options.env ?? process.env,
    input: options.input,
    timeoutMs: options.timeoutMs ?? 15 * 60_000,
    maxBuffer: options.maxBuffer ?? 128 * 1024 * 1024,
    signal: executionAbortController.signal,
  });
  activeInterruptibleCommands.add(execution);
  let result;
  try {
    result = await execution;
  } finally {
    activeInterruptibleCommands.delete(execution);
  }
  if (result.aborted || terminationRequested) {
    throw new Error(`${options.label ?? basename(command)} stopped for controlled termination`);
  }
  if (result.error || result.timedOut || result.status !== 0) {
    const diagnostic = sanitize(
      `${result.error?.message ?? ""}\nexit=${String(result.status)} signal=${String(result.signal)}\n${result.stderr ?? ""}\n${result.stdout ?? ""}`,
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

async function runInterruptibleAllowNonzero(command, args, options = {}) {
  assertExecutionMayContinue();
  const execution = runInterruptibleCommand({
    command,
    args,
    cwd: options.cwd ?? EXPECTED_REPO,
    env: options.env ?? process.env,
    input: options.input,
    timeoutMs: options.timeoutMs ?? 15 * 60_000,
    maxBuffer: options.maxBuffer ?? 128 * 1024 * 1024,
    signal: executionAbortController.signal,
  });
  activeInterruptibleCommands.add(execution);
  let result;
  try {
    result = await execution;
  } finally {
    activeInterruptibleCommands.delete(execution);
  }
  if (result.aborted || terminationRequested) {
    throw new Error(`${options.label ?? basename(command)} stopped for controlled termination`);
  }
  if (result.error || result.timedOut || result.signal) {
    const diagnostic = sanitize(
      `${result.error?.message ?? ""}\nexit=${String(result.status)} signal=${String(result.signal)}\n${result.stderr ?? ""}\n${result.stdout ?? ""}`,
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

async function runPinnedVercel(
  vercel,
  args,
  options = {},
  { allowNonzero = false, allowDuringTermination = false } = {},
) {
  if (
    !Array.isArray(args) ||
    args.length === 0 ||
    args.some((arg) => typeof arg !== "string") ||
    args.includes(vercel?.path)
  ) {
    throw new Error("Pinned Vercel invocation arguments are invalid");
  }
  const pinned = assertPinnedVercelCliUnchanged(vercel);
  let result;
  try {
    if (!allowDuringTermination) {
      result = await (allowNonzero
        ? runInterruptibleAllowNonzero
        : runInterruptible)(EXECUTABLE, [pinned.path, ...args], options);
    } else {
      const execution = runInterruptibleCommand({
        command: EXECUTABLE,
        args: [pinned.path, ...args],
        cwd: options.cwd ?? EXPECTED_REPO,
        env: options.env ?? process.env,
        input: options.input,
        timeoutMs: options.timeoutMs ?? 15 * 60_000,
        maxBuffer: options.maxBuffer ?? 128 * 1024 * 1024,
      });
      activeInterruptibleCommands.add(execution);
      try {
        result = await execution;
      } finally {
        activeInterruptibleCommands.delete(execution);
      }
      if (
        result.aborted ||
        result.error ||
        result.timedOut ||
        result.signal ||
        (!allowNonzero && result.status !== 0)
      ) {
        const diagnostic = sanitize(
          `${result.error?.message ?? ""}\nexit=${String(result.status)} signal=${String(result.signal)}\n${result.stderr ?? ""}\n${result.stdout ?? ""}`,
          options.secrets,
        );
        throw new Error(
          `${options.label ?? "pinned Vercel cleanup command"} failed: ${diagnostic}`,
        );
      }
      result = {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        status: result.status,
      };
    }
    if (!Number.isInteger(result?.status)) {
      throw new Error(
        `${options.label ?? "pinned Vercel command"} returned no exact exit status`,
      );
    }
    return result;
  } finally {
    assertPinnedVercelCliUnchanged(vercel);
  }
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

function captureDeployableSourceIdentity() {
  const manifestBytes = readFileSync(DEPLOYABLE_SOURCE_MANIFEST_PATH);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (
    manifest.schemaVersion !== "dealflow.deployable-source-manifest.v1" ||
    !Array.isArray(manifest.entries) ||
    manifest.entryCount !== manifest.entries.length ||
    !/^[a-f0-9]{64}$/.test(manifest.deployableSourceSha256 ?? "")
  ) {
    throw new Error("The deployable source manifest is malformed");
  }
  const manifestRelativePath = relative(
    EXPECTED_REPO,
    DEPLOYABLE_SOURCE_MANIFEST_PATH,
  );
  const trackedPaths = git(
    ["ls-files", "-z"],
    "enumerate tracked deployable source paths",
  ).split("\0").filter(Boolean);
  const ignoredPaths = new Set(
    git(
      ["ls-files", "-ci", "--exclude-from=.vercelignore", "-z"],
      "enumerate Vercel-ignored tracked source paths",
    ).split("\0").filter(Boolean),
  );
  const expectedTrackedPaths = trackedPaths
    .filter(
      (path) =>
        !ignoredPaths.has(path) &&
        path !== manifestRelativePath &&
        path !== ".gitignore",
    )
    .sort();
  const pathSetProof = assertExactDeployableSourcePathSet({
    manifestPaths: manifest.entries.map((entry) => String(entry?.path ?? "")),
    expectedTrackedPaths,
  });
  const digest = createHash("sha256");
  let previousPath = "";
  for (const entry of manifest.entries) {
    const path = String(entry?.path ?? "");
    if (
      !path ||
      path <= previousPath ||
      path.startsWith("/") ||
      path.split("/").includes("..")
    ) {
      throw new Error("The deployable source manifest path set is not exact");
    }
    previousPath = path;
    const absolute = resolve(EXPECTED_REPO, path);
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Deployable source must be a regular file: ${path}`);
    }
    const contents = readFileSync(absolute);
    if (
      stat.size !== entry.size ||
      stat.mode !== entry.mode ||
      sha256(contents) !== entry.sha256
    ) {
      throw new Error(`Deployable source differs from its manifest: ${path}`);
    }
    digest.update(`${path.length}\0${path}\0${contents.length}\0`);
    digest.update(contents);
    digest.update("\0");
  }
  const deployableSourceSha256 = digest.digest("hex");
  if (deployableSourceSha256 !== manifest.deployableSourceSha256) {
    throw new Error("The deployable source portfolio digest is not exact");
  }
  const imageBuildInputProof = assertExactStagingImageBuildInputInventory({
    root: EXPECTED_REPO,
    deployablePaths: manifest.entries.map((entry) => entry.path),
  });
  return Object.freeze({
    deployableSourceSha256,
    deployableFileCount: manifest.entryCount,
    deployableManifestSha256: sha256(manifestBytes),
    deployablePathSetExact: pathSetProof.exactPathSet,
    imageBuildInputProof,
  });
}

function captureExactReleaseIdentity() {
  if (realpathSync(process.cwd()) !== realpathSync(EXPECTED_REPO)) {
    throw new Error("Staging acceptance must run from the exact isolated release worktree");
  }
  if (process.versions.node.split(".")[0] !== "24") {
    throw new Error(`Staging acceptance requires Node 24; received ${process.version}`);
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
  const deployable = captureDeployableSourceIdentity();
  const dependencyLockSha256 = sha256(readFileSync(join(EXPECTED_REPO, "package-lock.json")));
  return Object.freeze({
    branch,
    commit,
    tree,
    ...tracked,
    dependencyLockSha256,
    ...deployable,
  });
}

function assertExactReleaseIdentityUnchanged(expected, label) {
  const current = captureExactReleaseIdentity();
  if (JSON.stringify(current) !== JSON.stringify(expected)) {
    throw new Error(`${label} no longer matches the exact release identity`);
  }
  return current;
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
  if (
    (process.env.VERCEL_PROJECT_ID &&
      process.env.VERCEL_PROJECT_ID !== String(project.projectId)) ||
    (process.env.VERCEL_ORG_ID &&
      process.env.VERCEL_ORG_ID !== String(project.orgId))
  ) {
    throw new Error(
      "Vercel CI project or organization authority conflicts with the validated staging link",
    );
  }
  return Object.freeze({
    evidence: Object.freeze({
      projectName: project.projectName,
      projectIdFingerprint: sha256(String(project.projectId)),
      organizationIdFingerprint: sha256(String(project.orgId)),
    }),
    projectId: String(project.projectId),
    organizationId: String(project.orgId),
  });
}

function extractProjectRef(rawUrl) {
  return parseExactHostedSupabaseProjectUrl(rawUrl).projectRef;
}

function protectedRuntimeValues() {
  const values = [
    process.env.VERCEL_CLI_JS,
    failureContext.vercelSelection?.sourcePath,
    failureContext.vercelSelection?.path,
    failureContext.vercelSelection?.sourceInstallationRoot,
    failureContext.vercelSelection?.installationRoot,
    failureContext.vercelSelection?.snapshotTrustRoot,
    process.env.VERCEL_TOKEN,
    process.env.VERCEL_ORG_ID,
    process.env.VERCEL_PROJECT_ID,
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.STAGING_QA_PASSWORD,
    process.env.PARTNER_ATTRIBUTION_SIGNING_SECRET,
    process.env.INTERNAL_SYSTEM_JOBS_SECRET,
    process.env.STAGING_ACCESS_GATE_SECRET,
    STAGING_TURNSTILE_SECRET_KEY,
    STAGING_TURNSTILE_TEST_TOKEN,
    ...failureContext.transientSecrets,
  ];
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      values.push(extractProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL));
    } catch {
      // Fail-closed environment validation reports malformed URLs separately.
    }
  }
  return [...new Set(values.filter(Boolean))];
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
    throw new Error("QA_EMAIL is not the exact non-admin synthetic harness identity");
  }
  requiredEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY", 32);
  requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY", 32);
  requiredStrongStagingSecret("STAGING_QA_PASSWORD", 16);
  requiredStrongStagingSecret("PARTNER_ATTRIBUTION_SIGNING_SECRET", 32);
  requiredStrongStagingSecret("INTERNAL_SYSTEM_JOBS_SECRET", 32);
  requiredStrongStagingSecret("VERCEL_AUTOMATION_BYPASS_SECRET", 32);
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

function withStagingAccess(headers = {}) {
  return {
    ...headers,
    [STAGING_ACCESS_HEADER]: requiredEnvironment("STAGING_ACCESS_GATE_SECRET", 43),
  };
}

function withVercelAutomationBypass(headers = {}, required = false) {
  if (!required) return { ...headers };
  if (
    !headers ||
    typeof headers !== "object" ||
    Array.isArray(headers) ||
    Object.keys(headers).some(
      (name) => name.toLowerCase() === VERCEL_PROTECTION_BYPASS_HEADER,
    )
  ) {
    throw new Error("Vercel automation bypass headers must be runner-owned");
  }
  return {
    ...headers,
    [VERCEL_PROTECTION_BYPASS_HEADER]: requiredStrongStagingSecret(
      "VERCEL_AUTOMATION_BYPASS_SECRET",
      32,
    ),
  };
}

function hostedStagingEnvironment(
  projectRef,
  vercelProjectId,
  identity,
  migrationIdentity,
  vercelDryRunSourceProof,
  stagingAccessGateSecret,
) {
  return Object.freeze({
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
    DEALFLOW_STAGING_VERCEL_PROJECT_ID: vercelProjectId,
    DEALFLOW_STAGING_HOST_ATTESTATION: "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1",
    DEALFLOW_RUNTIME_MIGRATION_PORTFOLIO_SHA256:
      migrationIdentity.migrationPortfolioSha256,
    DEALFLOW_RUNTIME_MIGRATION_COUNT: String(migrationIdentity.migrationCount),
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
    STAGING_ACCESS_GATE_SECRET: stagingAccessGateSecret,
    GHL_IFRAME_EMBED_ENABLED: "true",
    GHL_IFRAME_ALLOW_SHARED_HIGHLEVEL_ORIGINS: "true",
    GHL_IFRAME_PARTNER_PARENT_ORIGINS_JSON: "{}",
    GHL_APP_SHARED_SECRET: process.env.GHL_APP_SHARED_SECRET,
    NEXT_PUBLIC_DEALFLOW_RELEASE_COMMIT: identity.commit,
    NEXT_PUBLIC_DEALFLOW_RELEASE_TREE: identity.tree,
    NEXT_PUBLIC_DEALFLOW_TRACKED_WORKTREE_SHA256:
      identity.trackedWorktreeSha256,
    NEXT_PUBLIC_DEALFLOW_TRACKED_FILE_COUNT: String(identity.trackedFileCount),
    NEXT_PUBLIC_DEALFLOW_DEPENDENCY_LOCK_SHA256:
      identity.dependencyLockSha256,
    NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_SOURCE_SHA256:
      identity.deployableSourceSha256,
    NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_MANIFEST_SHA256:
      identity.deployableManifestSha256,
    NEXT_PUBLIC_DEALFLOW_DEPLOYABLE_FILE_COUNT:
      String(identity.deployableFileCount),
    NEXT_PUBLIC_DEALFLOW_VERCEL_DRY_RUN_SOURCE_SHA256:
      vercelDryRunSourceProof.sourceSetSha256,
    NEXT_PUBLIC_DEALFLOW_VERCEL_DRY_RUN_FILE_COUNT:
      String(vercelDryRunSourceProof.regularFileCount),
    NEXT_PUBLIC_LEAD_TURNSTILE_SITE_KEY: STAGING_TURNSTILE_SITE_KEY,
    TURNSTILE_SECRET_KEY: STAGING_TURNSTILE_SECRET_KEY,
    TURNSTILE_ALLOWED_HOSTNAMES: EXPECTED_APP_ALIASES
      .map(({ host }) => host)
      .join(","),
    INTERNAL_ADMIN_EMAILS: EXPECTED_OPERATOR_EMAIL,
    ...Object.fromEntries(REQUIRED_FALSE_CONTROLS.map((name) => [name, "false"])),
    ...REQUIRED_EQUAL_CONTROLS,
    ...Object.fromEntries(REQUIRED_DISABLED_OR_EMPTY_CONTROLS.map((name) => [name, "disabled"])),
  });
}

function prepareEvidenceDirectory(path) {
  const exactPath = assertApprovedStagingEvidenceRootPath(path, {
    approvedParent: approvedStagingEvidenceParent,
  });
  if (existsSync(exactPath)) throw new Error("Evidence directory must not already exist");
  mkdirSync(exactPath, { recursive: false, mode: 0o700 });
  chmodSync(exactPath, 0o700);
}

function resetEvidenceDirectoryForSafeFailureBundle(reason) {
  const path = assertApprovedStagingEvidenceRootPath(failureContext.evidenceDir, {
    approvedParent: approvedStagingEvidenceParent,
    mustExist: true,
  });
  rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  if (existsSync(path)) {
    throw new Error("Unsafe failure evidence root remained after deletion");
  }
  mkdirSync(path, { recursive: false, mode: 0o700 });
  chmodSync(path, 0o700);
  failureContext.unsealedPlaywrightArtifactDirectories = [];
  return {
    status: "PASS",
    disposition: "UNSAFE_PARTIAL_EVIDENCE_DESTROYED_AND_ROOT_RECREATED",
    reasonSha256: sha256(reason),
    containsSecrets: false,
  };
}

function writeJson(path, value, { allowDuringTermination = false } = {}) {
  if (terminationRequested && !allowDuringTermination) {
    throw new Error("Refused an evidence write after termination was requested");
  }
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
}

function writeTerminalFailureArtifact(
  sanitizedMessage,
  { partialBundleSecretStatus = "NOT_PROVEN", evidenceSafety = null } = {},
) {
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
  const approvedDirectPublicImageMatrixCheckpointFiles = readdirSync(evidenceDir)
    .filter((name) =>
      /^approved-direct-public-image-matrix-checkpoint-\d{2}\.json$/.test(name),
    )
    .sort();
  const approvedDirectPublicImageMatrixCheckpoints =
    approvedDirectPublicImageMatrixCheckpointFiles.map((file) => {
      const checkpoint = JSON.parse(readFileSync(join(evidenceDir, file), "utf8"));
      assertExactApprovedDirectPublicImageMatrixCheckpoint(checkpoint);
      return Object.freeze({ file, status: checkpoint.status });
    });
  const failedApprovedDirectPublicImageMatrixCheckpointCount =
    approvedDirectPublicImageMatrixCheckpoints.filter(
      ({ status }) => status === "FAILED",
    ).length;
  writeJson(join(evidenceDir, "STAGING_FAILURE.json"), {
    schemaVersion: "dealflow.isolated-staging-acceptance-failure.v1",
    status: "FAILED",
    stage: failureContext.stage || null,
    errorCode: "STAGING_ACCEPTANCE_FAILED",
    sanitizedErrorSha256: sha256(sanitizedMessage),
    sanitizedFailureDescriptorSha256: sha256(sanitizedMessage),
    approvedDirectPublicImageMatrixCheckpoints,
    approvedDirectPublicImageCheckpointEvidenceRetained:
      approvedDirectPublicImageMatrixCheckpoints.length > 0,
    failedApprovedDirectPublicImageMatrixCheckpointCount,
    approvedDirectPublicImageFailureMetadataRetainedByFailedCheckpoint:
      failedApprovedDirectPublicImageMatrixCheckpointCount > 0,
    candidateIdentity: identity
      ? { branch: identity.branch, commit: identity.commit, tree: identity.tree }
      : null,
    partialSealArtifactsPresent: [
      "FINAL_SUMMARY.json",
      "evidence-manifest.json",
      "SHA256SUMS",
    ].filter((name) => existsSync(join(evidenceDir, name))),
    failureArtifactContainsSecrets: false,
    partialBundleSecretStatus,
    evidenceSafety,
    containsRealCustomerData: false,
    productionMutationPerformed: false,
    providerMutationPerformed: false,
    advertisingSpendIncurred: false,
    realCommunicationSent: false,
    productionReleaseAuthorized: false,
  }, { allowDuringTermination: true });
  return true;
}

function readValidatedRound(path, identity, migrationIdentity, expectedRound, label) {
  if (!path || !existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) {
    throw new Error(`${label} must be an existing regular file`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const evidence = assertFinalVerificationEvidenceIsSealable(dirname(path));
  assertExactFinalVerificationSummaryPortfolio(parsed, `${label} portfolio`);
  if (
    parsed.schemaVersion !== "dealflow.final-verification.v3" ||
    String(parsed.round) !== expectedRound ||
    !/^v24\./.test(parsed.runtime ?? "") ||
    parsed.repositoryInvariant !== "passed" ||
    evidence.status !== "PASS" ||
    evidence.fileCountBeforeSummary !== parsed.evidenceTreeFileCountBeforeSummary ||
    evidence.totalFileCount !== parsed.evidenceTreeFileCountBeforeSummary + 1 ||
    evidence.evidenceTreeSha256BeforeSummary !==
      parsed.evidenceTreeSha256BeforeSummary ||
    evidence.browser.status !== parsed.localBrowserEvidenceStatus ||
    evidence.browser.screenshotCount !== parsed.localBrowserScreenshotCount ||
    JSON.stringify(evidence.browser.projectScreenshotCounts) !==
      JSON.stringify(parsed.localBrowserProjectScreenshotCounts) ||
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
      (record) =>
        record.status !== "passed" ||
        record.exitCode !== 0 ||
        record.postCommandRepositoryInvariant !== "passed" ||
        record.workingDirectory !== EXPECTED_REPO,
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
    resolvedCommandPortfolioSha256:
      parsed.resolvedCommandPortfolioSha256,
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
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ...extraEnvironment,
  };
}

async function runCapturedProofCommand(
  command,
  args,
  label,
  extraEnvironment = {},
  timeoutMs = 10 * 60_000,
) {
  const secrets = [
    ...protectedRuntimeValues(),
    ...Object.values(extraEnvironment),
  ];
  try {
    const result = await runInterruptible(command, args, {
      cwd: EXPECTED_REPO,
      env: authenticatedDatabaseProofEnvironment(extraEnvironment),
      maxBuffer: 128 * 1024 * 1024,
      timeoutMs,
      label,
      secrets,
    });
    return {
      label,
      status: "PASS",
      exitCode: result.status,
      signal: null,
      diagnostic: sanitize(`${result.stdout}\n${result.stderr}`, secrets),
    };
  } catch (error) {
    if (terminationRequested) throw error;
    return {
      label,
      status: "FAIL",
      exitCode: null,
      signal: null,
      diagnostic: sanitize(
        error instanceof Error ? error.message : String(error),
        secrets,
      ),
    };
  }
}

function seedEnvironment(
  partnerBaseUrl,
  secondPartnerBaseUrl,
  ghlEmbedAuthExchangePreflightCount,
) {
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
    DEALFLOW_GHL_EMBED_AUTH_EXCHANGE_PREFLIGHT_COUNT:
      String(ghlEmbedAuthExchangePreflightCount),
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

async function runSeed(
  partnerBaseUrl,
  secondPartnerBaseUrl,
  ghlEmbedAuthExchangePreflightCount,
) {
  const secrets = protectedRuntimeValues();
  const result = await runInterruptible(
    EXECUTABLE,
    [join(EXPECTED_REPO, "scripts", "seed-isolated-staging.mjs")],
    {
      label: "isolated synthetic staging seed",
      env: seedEnvironment(
        partnerBaseUrl,
        secondPartnerBaseUrl,
        ghlEmbedAuthExchangePreflightCount,
      ),
      timeoutMs: 5 * 60_000,
      secrets,
    },
  );
  const parsed = parseSingleJsonOutput(result.stdout, "staging seed");
  if (
    parsed.status !== "SEEDED" ||
    parsed.projectFingerprint !== EXPECTED_SUPABASE_FINGERPRINT ||
    parsed.safeSuffix !== EXPECTED_SUPABASE_SAFE_SUFFIX ||
    parsed.providerCredentialPresent !== false ||
    parsed.providerMutationPerformed !== false ||
    parsed.exactSyntheticAuthUserCount !== 11 ||
    parsed.exactFixtureCountsVerified !== true ||
    !/^[a-f0-9-]{36}$/i.test(parsed.qaHarness?.userId ?? "") ||
    parsed.qaHarness?.organizationId !== PAID_ORGANIZATION_ID ||
    !/^[a-f0-9-]{36}$/i.test(parsed.qaHarness?.membershipId ?? "") ||
    parsed.qaHarness?.role !== "member" ||
    parsed.qaHarness?.authorityResetPolicyApplied !== true ||
    parsed.qaHarness?.organizationMembershipCount !== 1 ||
    parsed.qaHarness?.partnerMembershipCount !== 0 ||
    parsed.qaHarness?.activePartnerMembershipCount !== 0 ||
    parsed.qaHarness?.ownedOrganizationCount !== 0 ||
    parsed.qaHarness?.profilePartnerId !== null ||
    parsed.qaHarness?.elevated !== false ||
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
    parsed.rlsCreditFixtures?.userAId !== parsed.scenarios?.paidDirect?.userId ||
    parsed.rlsCreditFixtures?.organizationAId !== PAID_ORGANIZATION_ID ||
    parsed.rlsCreditFixtures?.balanceA !== 1_000 ||
    !/^[a-f0-9-]{36}$/i.test(parsed.rlsCreditFixtures?.ledgerAId ?? "") ||
    parsed.rlsCreditFixtures?.billingAId !== PAID_BILLING_ID ||
    parsed.rlsCreditFixtures?.userBId !== parsed.scenarios?.attacker?.userId ||
    parsed.rlsCreditFixtures?.organizationBId !== ATTACKER_ORGANIZATION_ID ||
    parsed.rlsCreditFixtures?.balanceB !== 100 ||
    !/^[a-f0-9-]{36}$/i.test(parsed.rlsCreditFixtures?.ledgerBId ?? "") ||
    parsed.rlsCreditFixtures?.ledgerAId === parsed.rlsCreditFixtures?.ledgerBId ||
    !/^[a-f0-9-]{36}$/i.test(parsed.rlsCreditFixtures?.stripeEventAId ?? "") ||
    !/^[a-f0-9-]{36}$/i.test(parsed.rlsCreditFixtures?.stripeEventBId ?? "") ||
    parsed.rlsCreditFixtures?.stripeEventAId === parsed.rlsCreditFixtures?.stripeEventBId ||
    !/^[a-f0-9-]{36}$/i.test(parsed.rlsCreditFixtures?.providerUsageLimitAId ?? "") ||
    !/^[a-f0-9-]{36}$/i.test(parsed.rlsCreditFixtures?.providerUsageLimitBId ?? "") ||
    parsed.rlsCreditFixtures?.providerUsageLimitAId ===
      parsed.rlsCreditFixtures?.providerUsageLimitBId ||
    !/^[a-f0-9-]{36}$/i.test(parsed.rlsCreditFixtures?.providerUsageEventAId ?? "") ||
    !/^[a-f0-9-]{36}$/i.test(parsed.rlsCreditFixtures?.providerUsageEventBId ?? "") ||
    parsed.rlsCreditFixtures?.providerUsageEventAId ===
      parsed.rlsCreditFixtures?.providerUsageEventBId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(parsed.rlsCreditFixtures?.providerUsageDate ?? "") ||
    parsed.rlsCreditFixtures?.providerMutationPerformed !== false ||
    parsed.rlsCreditFixtures?.replayIdempotent !== true ||
    parsed.successorProviderIndependent?.exactMigrationChainRequired !== 125 ||
    parsed.successorProviderIndependent?.finalMigration !==
      "20260722040000_add_service_only_operator_grant_probe.sql" ||
    parsed.successorProviderIndependent?.financialFixture?.creditTopUpIntentId !==
      "e3000000-0000-4000-8000-000000000001" ||
    parsed.successorProviderIndependent?.financialFixture?.semanticReplayIdempotent !== true ||
    parsed.successorProviderIndependent?.financialFixture?.pendingProjectionReplayIdempotent !== true ||
    parsed.successorProviderIndependent?.financialFixture?.pendingPaymentCreditLedgerRows !== 0 ||
    parsed.successorProviderIndependent?.financialFixture?.providerMutationPerformed !== false ||
    parsed.successorProviderIndependent?.financialFixture?.financialEffectPerformed !== false ||
    parsed.successorProviderIndependent?.serviceOnlySchema?.schemaVersion !== "20260720010000" ||
    parsed.successorProviderIndependent?.serviceOnlySchema?.serviceOnlyTableCount !== 18 ||
    parsed.successorProviderIndependent?.serviceOnlySchema?.ghlMarketplaceTableCount !== 7 ||
    parsed.successorProviderIndependent?.serviceOnlySchema?.stripeLifecycleTableCount !== 4 ||
    parsed.successorProviderIndependent?.serviceOnlySchema?.postAuditServiceOnlyTableCount !== 7 ||
    parsed.successorProviderIndependent?.serviceOnlySchema?.authenticatedDenialCount !== 18 ||
    parsed.successorProviderIndependent?.serviceOnlySchema?.serviceRoleDirectDenialCount !== 1 ||
    parsed.successorProviderIndependent?.serviceOnlySchema?.ghlEmbedAuthExchangeCountSource !==
      "direct_postgres_preseed_read_only" ||
    parsed.successorProviderIndependent?.serviceOnlySchema?.exactSyntheticCountsVerified !== true ||
    parsed.successorProviderIndependent?.hostedGates?.optimizerMinimumSampleActiveReceiptProof !==
      "BLOCKED_PROVIDER_INDEPENDENT_ACTIVE_META_RECEIPT_REQUIRED" ||
    parsed.successorProviderIndependent?.hostedGates?.ghlMarketplaceInstallLifecycle !==
      "BLOCKED_EXTERNAL_GHL_SANDBOX_AUTHORITY" ||
    parsed.successorProviderIndependent?.hostedGates?.stripeSignedWebhookLifecycle !==
      "BLOCKED_EXTERNAL_STRIPE_TEST_AUTHORITY" ||
    parsed.successorProviderIndependent?.providerMutationPerformed !== false ||
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
    JSON.stringify(first.qaHarness) !== JSON.stringify(second.qaHarness) ||
    JSON.stringify(first.scenarios) !== JSON.stringify(second.scenarios) ||
    JSON.stringify(first.organizations) !== JSON.stringify(second.organizations) ||
    JSON.stringify(first.partner) !== JSON.stringify(second.partner) ||
    JSON.stringify(first.partnerTwo) !== JSON.stringify(second.partnerTwo) ||
    JSON.stringify(first.reportingFixtures) !== JSON.stringify(second.reportingFixtures) ||
    JSON.stringify(first.rlsCreditFixtures) !== JSON.stringify(second.rlsCreditFixtures) ||
    JSON.stringify(first.successorProviderIndependent) !==
      JSON.stringify(second.successorProviderIndependent) ||
    JSON.stringify(first.failureFixtures) !== JSON.stringify(second.failureFixtures) ||
    second.activationReplayIdempotent !== true ||
    second.metaActivationReplayIdempotent !== true
  ) {
    throw new Error("Staging fixture replay was not exactly idempotent");
  }
  return classifyExactSyntheticRetentionAuthorityReplay(first, second);
}

async function runProviderIndependentStagingProof(
  baseUrl,
  providerSessionBundleJson,
  providerSessionSecrets,
  ghlEmbedAuthExchangePreflightCount,
) {
  const environment = {
    ...childBaseEnvironment(),
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
    STAGING_ACCEPTANCE_BASE_URL: baseUrl,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    INTERNAL_SYSTEM_JOBS_SECRET: process.env.INTERNAL_SYSTEM_JOBS_SECRET,
    STAGING_ACCESS_GATE_SECRET: process.env.STAGING_ACCESS_GATE_SECRET,
    STAGING_TURNSTILE_TEST_TOKEN,
    STAGING_SYNTHETIC_PROVIDER_SESSION_BUNDLE: providerSessionBundleJson,
    DEALFLOW_GHL_EMBED_AUTH_EXCHANGE_PREFLIGHT_COUNT:
      String(ghlEmbedAuthExchangePreflightCount),
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
  const result = await runInterruptible(
    EXECUTABLE,
    [join(EXPECTED_REPO, "scripts", "staging", "run-provider-independent-staging-proof.mjs")],
    {
      label: "provider-independent isolated staging journey proof",
      env: environment,
      timeoutMs: 10 * 60_000,
      secrets: [...protectedRuntimeValues(), ...providerSessionSecrets],
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
    parsed.authentication?.sessionPortfolioSchema !==
      SYNTHETIC_PROVIDER_SESSION_BUNDLE_SCHEMA ||
    parsed.authentication?.reusedRoleCount !== 3 ||
    parsed.authentication?.passwordSignInCount !== 0 ||
    parsed.authentication?.rawTokenPersisted !== false ||
    parsed.accountDeletion?.taskCount !== 16 ||
    parsed.accountDeletion?.suspended !== true ||
    parsed.accountDeletion?.executionEnabled !== false ||
    parsed.accountDeletion?.providerWritesEnabled !== false ||
    parsed.accountDeletion?.providerReceiptCount !== 0 ||
    parsed.accountDeletion?.hostedWorkerFailClosed !== true ||
    parsed.accountDeletion?.fullProviderOffboardingPerformed !== false ||
    parsed.successorProviderIndependent?.schemaVersion !== "20260720010000" ||
    parsed.successorProviderIndependent?.serviceOnlyTableCount !== 18 ||
    parsed.successorProviderIndependent?.postAuditServiceOnlyTableCount !== 7 ||
    parsed.successorProviderIndependent?.authenticatedDenialCount !== 18 ||
    parsed.successorProviderIndependent?.serviceRoleDirectDenialCount !== 1 ||
    parsed.successorProviderIndependent?.ghlEmbedAuthExchangeCountSource !==
      "direct_postgres_preseed_read_only" ||
    parsed.successorProviderIndependent?.exactSyntheticCountsVerified !== true ||
    parsed.successorProviderIndependent?.serviceOnlyStateUnchanged !== true ||
    parsed.successorProviderIndependent?.pendingCreditTopUpIntentId !==
      "e3000000-0000-4000-8000-000000000001" ||
    parsed.successorProviderIndependent?.pendingPaymentState !== "pending" ||
    parsed.successorProviderIndependent?.pendingPaymentCreditLedgerRows !== 0 ||
    parsed.successorProviderIndependent?.hostedGates?.optimizerMinimumSampleActiveReceiptProof !==
      "BLOCKED_PROVIDER_INDEPENDENT_ACTIVE_META_RECEIPT_REQUIRED" ||
    parsed.successorProviderIndependent?.hostedGates?.ghlMarketplaceInstallLifecycle !==
      "BLOCKED_EXTERNAL_GHL_SANDBOX_AUTHORITY" ||
    parsed.successorProviderIndependent?.hostedGates?.stripeSignedWebhookLifecycle !==
      "BLOCKED_EXTERNAL_STRIPE_TEST_AUTHORITY" ||
    parsed.successorProviderIndependent?.providerMutationPerformed !== false ||
    parsed.successorProviderIndependent?.financialEffectPerformed !== false ||
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

async function proveExactVercelDryRunSourcePortfolio(vercel) {
  const result = await runPinnedVercel(
    vercel,
    [
      "deploy",
      "--dry",
      "--format=json",
      "--no-color",
      "--yes",
    ],
    {
      label: "inspect exact Vercel deployment source portfolio without upload",
      env: vercelEnvironment(),
      timeoutMs: 3 * 60_000,
      secrets: protectedRuntimeValues(),
    },
  );
  const dryRun = parseSingleJsonOutput(
    result.stdout,
    "Vercel deployment dry-run source portfolio",
  );
  const manifest = JSON.parse(
    readFileSync(DEPLOYABLE_SOURCE_MANIFEST_PATH, "utf8"),
  );
  const proof = assertExactVercelDryRunSourcePortfolio({
    dryRun,
    manifest,
    root: EXPECTED_REPO,
    manifestRelativePath: relative(
      EXPECTED_REPO,
      DEPLOYABLE_SOURCE_MANIFEST_PATH,
    ),
  });
  return Object.freeze({
    schemaVersion: "dealflow.vercel-dry-run-source-proof.v1",
    ...proof,
    vercelCliVersion: vercel.version,
    vercelCliSha256: vercel.sha256,
    vercelCliInstallationSha256: vercel.installationSha256,
    vercelCliInstallationFileCount: vercel.installationFileCount,
    vercelCliInstallationDirectoryCount: vercel.installationDirectoryCount,
    vercelCliInstallationSymlinkCount: vercel.installationSymlinkCount,
    vercelCliInstallationByteCount: vercel.installationByteCount,
    vercelCliSourcePathPersisted: false,
    vercelCliSnapshotPathPersisted: false,
    deploymentCreated: false,
    uploadPerformed: false,
    pathNamesPersisted: false,
    fileContentsPersisted: false,
  });
}

function assertExactVercelDryRunProofUnchanged(expected, current, label) {
  if (
    expected?.status !== "PASS" ||
    current?.status !== "PASS" ||
    JSON.stringify(current) !== JSON.stringify(expected)
  ) {
    throw new Error(`${label} no longer matches the exact Vercel source portfolio`);
  }
  return current;
}

function vercelEnvironment() {
  const env = { ...childBaseEnvironment() };
  for (const name of ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"]) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return env;
}

async function configureHostedStagingProtection(vercel, projectId) {
  return await configureExactStagingVercelProtection({
    projectId,
    expectedProjectName: EXPECTED_VERCEL_PROJECT_NAME,
    expectedProjectIdFingerprint: EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT,
    expectedOrganizationIdFingerprint: EXPECTED_VERCEL_ORG_ID_FINGERPRINT,
    async request({ method, path, body }) {
      const args = ["api", path, "--raw", "--no-color"];
      let input;
      if (method === "PATCH") {
        args.push("--method", "PATCH", "--input", "-");
        input = `${JSON.stringify(body)}\n`;
      }
      const response = await runPinnedVercel(vercel, args, {
        label: `${method.toLowerCase()} isolated staging Vercel protection`,
        env: vercelEnvironment(),
        input,
        timeoutMs: 3 * 60_000,
        secrets: protectedRuntimeValues(),
      });
      return parseSingleJsonOutput(
        response.stdout,
        `${method.toLowerCase()} isolated staging Vercel protection`,
      );
    },
  });
}

async function verifyHostedStagingProtection(vercel, projectId) {
  return await verifyExactStagingVercelProtection({
    projectId,
    expectedProjectName: EXPECTED_VERCEL_PROJECT_NAME,
    expectedProjectIdFingerprint: EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT,
    expectedOrganizationIdFingerprint: EXPECTED_VERCEL_ORG_ID_FINGERPRINT,
    async request({ method, path }) {
      if (method !== "GET") {
        throw new Error("Post-deployment Vercel protection verification must be read-only");
      }
      const response = await runPinnedVercel(
        vercel,
        ["api", path, "--raw", "--no-color"],
        {
          label: "read-only post-deployment isolated staging Vercel protection",
          env: vercelEnvironment(),
          timeoutMs: 3 * 60_000,
          secrets: protectedRuntimeValues(),
        },
      );
      return parseSingleJsonOutput(
        response.stdout,
        "read-only post-deployment isolated staging Vercel protection",
      );
    },
  });
}

async function configureHostedStagingEnvironment(
  environment,
  projectId,
  organizationId,
) {
  return await synchronizeExactVercelEnvironment({
    projectId,
    organizationId,
    token: requiredEnvironment("VERCEL_TOKEN", 20),
    expectedProjectIdFingerprint: EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT,
    expectedOrganizationIdFingerprint: EXPECTED_VERCEL_ORG_ID_FINGERPRINT,
    environment,
    sensitiveKeys: HOSTED_SECRET_ENV_NAMES,
    expectedCount: 95,
    providerSensitiveNames: PROVIDER_SENSITIVE_ENV_NAMES,
    fetchImpl: fetch,
    delayImpl: abortableDelay,
    batchSize: 20,
    maxAttempts: 4,
    requestTimeoutMs: 30_000,
    maxRetryAfterMs: 60_000,
  });
}

function assertExactHostedEnvironmentProof(proof) {
  const expectedSensitiveCount = HOSTED_SECRET_ENV_NAMES.size;
  const expectedReadableCount = 95 - expectedSensitiveCount;
  if (
    proof?.status !== "PASS" ||
    proof.synchronizationMode !== "bounded_idempotent_missing_or_drifted_only" ||
    proof.environmentVariableCount !== 95 ||
    proof.environmentNameSetSha256 !== EXPECTED_HOSTED_ENVIRONMENT_NAME_SET_SHA256 ||
    proof.finalExactStructureCount !== 95 ||
    proof.finalReadableValueDigestMatchCount !== expectedReadableCount ||
    proof.finalSensitiveValueWriteAcknowledgementCount !== expectedSensitiveCount ||
    proof.finalExpectedValueDispositionCount !== 95 ||
    proof.finalUnexpectedEnvironmentCount !== 0 ||
    proof.exactTarget !== "production" ||
    proof.exactTypePortfolioProven !== true ||
    proof.exactBranchScope !== null ||
    proof.exactCustomEnvironmentScopeCount !== 0 ||
    proof.secretValuesPersistedToEvidence !== false ||
    proof.valueDigestsPersistedToEvidence !== false ||
    proof.providerCredentialNamesPresent !== false ||
    !Array.isArray(proof.variables) ||
    proof.variables.length !== 95
  ) {
    throw new Error("The exact 95-variable isolated staging environment proof is incomplete");
  }
  const seen = new Set();
  for (const variable of proof.variables) {
    const expectedType = HOSTED_SECRET_ENV_NAMES.has(variable?.key)
      ? "sensitive"
      : "encrypted";
    const expectedFinalStatus = expectedType === "sensitive"
      ? "present_exact_metadata_value_write_acknowledged"
      : "present_exact";
    if (
      typeof variable?.key !== "string" ||
      seen.has(variable.key) ||
      variable.target !== "production" ||
      variable.type !== expectedType ||
      variable.branchScope !== null ||
      variable.finalStatus !== expectedFinalStatus
    ) {
      throw new Error("The isolated staging environment variable portfolio is not exact");
    }
    seen.add(variable.key);
  }
  if (sha256([...seen].sort().join("\n")) !== EXPECTED_HOSTED_ENVIRONMENT_NAME_SET_SHA256) {
    throw new Error("The isolated staging environment variable name set drifted");
  }
}

async function fetchAuthoritativeVercelDeployment(
  vercel,
  deploymentId,
  label,
  { timeoutMs = 3 * 60_000 } = {},
) {
  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) {
    throw new Error(`${label} returned an invalid Vercel deployment id`);
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3 * 60_000) {
    throw new Error(`${label} Vercel deployment read timeout is outside the bounded contract`);
  }
  const response = await runPinnedVercel(
    vercel,
    [
      "api",
      `/v13/deployments/${deploymentId}`,
      "--raw",
      "--no-color",
    ],
    {
      label: `${label} authoritative Vercel deployment API read`,
      env: vercelEnvironment(),
      timeoutMs,
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

function exactAliasRecordPath(aliasHost) {
  if (!EXPECTED_APP_ALIASES.some(({ host }) => host === aliasHost)) {
    throw new Error("Vercel alias record read rejected an unregistered host");
  }
  return `/v4/aliases/${encodeURIComponent(aliasHost)}`;
}

function sameExactAliasMapping(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function fetchExactAliasMapping(
  vercel,
  alias,
  label,
  { timeoutMs = 3 * 60_000 } = {},
) {
  if (
    !EXPECTED_APP_ALIASES.some(
      ({ host, url }) => host === alias.host && url === alias.url,
    )
  ) {
    throw new Error(`${label} received an unregistered staging alias`);
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3 * 60_000) {
    throw new Error(`${label} Vercel alias read timeout is outside the bounded contract`);
  }
  const startedAt = performance.now();
  const result = await runPinnedVercel(
    vercel,
    ["api", exactAliasRecordPath(alias.host), "--raw", "--no-color"],
    {
      label: `${label} authoritative Vercel alias record read`,
      env: vercelEnvironment(),
      timeoutMs,
      secrets: protectedRuntimeValues(),
    },
    { allowNonzero: true },
  );
  if (result.status !== 0) {
    const diagnostic = sanitize(
      `${result.stderr}\n${result.stdout}`,
      protectedRuntimeValues(),
    );
    if (!/(?:Response Error[^\n]*\b404\b|\b404\b[^\n]*(?:not found|NOT_FOUND))/i.test(diagnostic)) {
      throw new Error(`${label} authoritative Vercel alias read failed: ${diagnostic}`);
    }
    const remainingMs = Math.floor(timeoutMs - (performance.now() - startedAt));
    if (remainingMs < 1) {
      throw new Error(`${label} authoritative Vercel alias read exhausted its bounded timeout`);
    }
    const publicSurface = await requestExactAppAlias(alias, {}, {
      timeoutMs: Math.min(EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS, remainingMs),
    });
    if (
      publicSurface.status !== 404 ||
      publicSurface.disposition !== "VERCEL_DEPLOYMENT_NOT_FOUND"
    ) {
      throw new Error(`${label} returned 404 authority without an exact closed Vercel surface`);
    }
    return null;
  }

  const record = parseSingleJsonOutput(
    result.stdout,
    `${label} authoritative Vercel alias record`,
  );
  const deploymentId = record.deploymentId ?? null;
  const deploymentHost = record.deployment?.url ?? null;
  if (
    record.alias !== alias.host ||
    typeof record.projectId !== "string" ||
    sha256(record.projectId) !== EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT ||
    !/^dpl_[A-Za-z0-9]+$/.test(deploymentId ?? "") ||
    record.deployment?.id !== deploymentId ||
    typeof deploymentHost !== "string" ||
    !/^[a-z0-9-]+\.vercel\.app$/i.test(deploymentHost) ||
    EXPECTED_APP_ALIASES.some(({ host }) => host === deploymentHost) ||
    PRODUCTION_OR_SHARED_HOSTS.has(deploymentHost)
  ) {
    throw new Error(`${label} is not owned by the exact isolated staging project`);
  }
  const remainingMs = Math.floor(timeoutMs - (performance.now() - startedAt));
  if (remainingMs < 1) {
    throw new Error(`${label} authoritative Vercel alias proof exhausted its bounded timeout`);
  }
  const authoritative = await fetchAuthoritativeVercelDeployment(
    vercel,
    deploymentId,
    `${label} mapped deployment`,
    { timeoutMs: remainingMs },
  );
  const authoritativeProjectId =
    authoritative.projectId ?? authoritative.project?.id;
  if (
    authoritative.url !== deploymentHost ||
    sha256(String(authoritativeProjectId)) !==
      EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT
  ) {
    throw new Error(`${label} mapped deployment authority did not match`);
  }
  return Object.freeze({
    deploymentId,
    deploymentHost,
    projectIdFingerprint: EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT,
  });
}

async function proveAuthoritativePreDeployAliasOwnership(vercel) {
  const aliases = [];
  for (const alias of EXPECTED_APP_ALIASES) {
    const priorMapping = await fetchExactAliasMapping(
      vercel,
      alias,
      `${alias.label} pre-deployment alias`,
    );
    aliases.push(Object.freeze({
      label: alias.label,
      host: alias.host,
      priorMapping,
      ownedByDifferentAccessibleProject: false,
    }));
  }
  return Object.freeze({
    status: "PASS",
    phase: "immediately_before_protection_and_deployment",
    aliasCount: aliases.length,
    aliases,
    exactIsolatedProjectOnly: true,
    aliasesCreatedOrChanged: false,
  });
}

async function deployExactCommit(identity, vercel) {
  const args = [
    "deploy",
    "--prod",
    "--skip-domain",
    "--yes",
    "--force",
    "--meta", `dealflowCommit=${identity.commit}`,
    "--meta", `dealflowTree=${identity.tree}`,
    "--meta", "dealflowEnvironment=isolated-staging-qibh",
  ];
  const deployment = await runPinnedVercel(vercel, args, {
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
  const inspect = await runPinnedVercel(
    vercel,
    ["inspect", uniqueDeploymentUrl.origin, "--format=json", "--no-color"],
    {
      label: "inspect isolated Vercel staging deployment",
      env: vercelEnvironment(),
      timeoutMs: 3 * 60_000,
      secrets: protectedRuntimeValues(),
    },
  );
  const inspected = parseSingleJsonOutput(inspect.stdout, "Vercel deployment inspection");
  const deploymentId = inspected.id ?? inspected.uid ?? null;
  const authoritative = await fetchAuthoritativeVercelDeployment(
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
  let hostedExactCandidateEnumeratedImagePortfolioProof;
  try {
    hostedExactCandidateEnumeratedImagePortfolioProof = Object.freeze({
      ...assertExactCandidateDeployedImagePortfolioConfiguration({
        images: authoritative.images,
        optimizerEligibleStaticMediaAssetCount:
          identity.imageBuildInputProof.optimizerEligibleStaticMediaAssetCount,
        sourceNextConfigLocalPatternsDenyAll:
          identity.imageBuildInputProof.sourceNextConfigLocalPatternsDenyAll,
        sourceNextConfigRemotePatternsDenyAll:
          identity.imageBuildInputProof.sourceNextConfigRemotePatternsDenyAll,
      }),
      exactCandidateCommitMatchedBeforeConfigurationProof: true,
      exactCandidateTreeMatchedBeforeConfigurationProof: true,
      exactIsolatedStagingProjectMatchedBeforeConfigurationProof: true,
      deployableManifestBoundImageInventoryMatched: true,
    });
  } catch (error) {
    writeJson(
      join(
        failureContext.evidenceDir,
        "hosted-exact-candidate-image-portfolio-failure.json",
      ),
      {
        schemaVersion:
          "dealflow.vercel-deployed-image-exact-candidate-portfolio-failure.v1",
        status: "FAILED_CLOSED",
        sanitizedShape: summarizeDeployedImageConfiguration(
          authoritative.images,
        ),
        optimizerEligibleStaticMediaAssetCount:
          identity.imageBuildInputProof.optimizerEligibleStaticMediaAssetCount,
        sourceNextConfigLocalPatternsDenyAll:
          identity.imageBuildInputProof.sourceNextConfigLocalPatternsDenyAll,
        sourceNextConfigRemotePatternsDenyAll:
          identity.imageBuildInputProof.sourceNextConfigRemotePatternsDenyAll,
        exactCandidateIdentityValidatedBeforeConfigurationProof: true,
        exactIsolatedStagingProjectValidatedBeforeConfigurationProof: true,
        rawDeploymentMetadataPersisted: false,
        deploymentIdPersistedInThisProof: false,
        projectIdPersistedInThisProof: false,
      },
    );
    throw error;
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
    cliInstallationSha256: vercel.installationSha256,
    cliInstallationFileCount: vercel.installationFileCount,
    cliInstallationDirectoryCount: vercel.installationDirectoryCount,
    cliInstallationSymlinkCount: vercel.installationSymlinkCount,
    cliInstallationByteCount: vercel.installationByteCount,
    cliSourcePathPersisted: false,
    cliSnapshotPathPersisted: false,
    hostedExactCandidateEnumeratedImagePortfolioProof,
  };
}

async function configureAndProveAppAlias(
  identity,
  deployment,
  vercel,
  { aliasLabel, aliasHost, aliasUrl, priorMapping },
) {
  if (
    !EXPECTED_APP_ALIASES.some(({ host, url }) => host === aliasHost && url === aliasUrl) ||
    new URL(aliasUrl).hostname !== aliasHost ||
    PRODUCTION_OR_SHARED_HOSTS.has(aliasHost)
  ) {
    throw new Error(`The ${aliasLabel} staging app alias is not exact and isolated`);
  }
  const exactAlias = EXPECTED_APP_ALIASES.find(({ host }) => host === aliasHost);
  const mappingImmediatelyBeforeMutation = await fetchExactAliasMapping(
    vercel,
    exactAlias,
    `${aliasLabel} immediate pre-mutation alias`,
  );
  if (!sameExactAliasMapping(mappingImmediatelyBeforeMutation, priorMapping)) {
    throw new Error(`${aliasLabel} staging app alias drifted after pre-deployment authority proof`);
  }
  const rollbackRecord = {
    aliasLabel,
    aliasHost,
    aliasUrl,
    priorMapping,
    intendedDeploymentId: deployment.deploymentId,
    intendedDeploymentHost: deployment.deploymentHost,
    projectIdFingerprint: EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT,
    intentRegistered: true,
    mutationCommandCompleted: false,
  };
  failureContext.stagingAliasMutations.push(rollbackRecord);
  await runPinnedVercel(
    vercel,
    [
      "alias",
      "set",
      deployment.deploymentHost,
      aliasHost,
      "--no-color",
    ],
    {
      label: `configure ${aliasLabel} isolated staging app alias`,
      env: vercelEnvironment(),
      timeoutMs: 3 * 60_000,
      secrets: protectedRuntimeValues(),
    },
  );
  rollbackRecord.mutationCommandCompleted = true;
  const currentMapping = await fetchExactAliasMapping(
    vercel,
    exactAlias,
    `${aliasLabel} post-mutation alias`,
  );
  if (
    currentMapping?.deploymentId !== deployment.deploymentId ||
    currentMapping?.deploymentHost !== deployment.deploymentHost ||
    currentMapping?.projectIdFingerprint !== EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT
  ) {
    throw new Error(`${aliasLabel} staging app alias does not target the exact candidate deployment`);
  }
  return {
    deploymentId: currentMapping.deploymentId,
    aliasLabel,
    aliasUrl,
    aliasHost,
    exactCommit: identity.commit,
    exactTree: identity.tree,
    projectIdFingerprint: EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT,
  };
}

async function requestExactAppAlias(
  alias,
  headers = {},
  {
    allowDuringTermination = false,
    timeoutMs = EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS,
  } = {},
) {
  const endpoint = new URL("/privacy", alias.url);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== alias.host ||
    endpoint.port !== "" ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    !EXPECTED_APP_ALIASES.some(({ host, url }) => host === alias.host && url === alias.url)
  ) {
    throw new Error("Application-gate proof received a non-exact staging alias");
  }
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS
  ) {
    throw new Error("Application-gate request timeout is outside the bounded contract");
  }
  const response = await (allowDuringTermination ? cleanupFetch : executionFetch)(
    endpoint,
    {
      headers: {
        Accept: "text/html",
        "User-Agent": "DealFlow-Staging-Acceptance/1.0",
        ...headers,
      },
      redirect: "manual",
    },
    timeoutMs,
  );
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.toLowerCase().includes("application/json")
    ? await response.json().catch(() => null)
    : (await response.arrayBuffer(), null);
  if (response.url !== endpoint.toString() || response.redirected) {
    throw new Error(`${alias.label} application-gate request changed URL`);
  }
  const rawLocation = response.headers.get("location");
  let protectionRedirect = null;
  if (response.status === 302) {
    protectionRedirect = classifyExactVercelAutomationProtectionRedirect({
      endpointUrl: endpoint.toString(),
      responseUrl: response.url,
      status: response.status,
      redirected: response.redirected,
      rawLocation,
    });
  }
  const vercelDeploymentNotFound =
    response.status === 404 &&
    response.headers.get("x-vercel-error") === "DEPLOYMENT_NOT_FOUND";
  const dealflowApplicationGate =
    [404, 503].includes(response.status) &&
    response.headers.get("cache-control")?.includes("no-store") === true &&
    response.headers.get("x-robots-tag")?.includes("noindex") === true &&
    ["Not found.", "Isolated staging access is unavailable."].includes(
      payload?.error,
    );
  return {
    status: response.status,
    redirected: false,
    locationPresent: rawLocation !== null,
    protectionBypass: null,
    protectionRedirect,
    responseUrlExact: true,
    disposition: protectionRedirect
      ? "VERCEL_AUTOMATION_PROTECTION"
      : vercelDeploymentNotFound
      ? "VERCEL_DEPLOYMENT_NOT_FOUND"
      : dealflowApplicationGate
        ? "DEALFLOW_APPLICATION_GATE"
        : response.status === 200
          ? "AUTHORIZED_HTTP_200"
          : "UNRECOGNIZED",
  };
}

async function requestExactAppAliasEdgeObservation(
  alias,
  { timeoutMs, allowDuringTermination = false },
) {
  const startedAt = performance.now();
  const publicObservation = await requestExactAppAlias(
    alias,
    {},
    { timeoutMs, allowDuringTermination },
  );
  if (publicObservation.disposition !== "VERCEL_AUTOMATION_PROTECTION") {
    return publicObservation;
  }
  const remainingMs = Math.floor(timeoutMs - (performance.now() - startedAt));
  if (remainingMs < 1) {
    throw new Error("Vercel automation bypass probe exhausted its bounded timeout");
  }
  const bypassObservation = await requestExactAppAlias(
    alias,
    withVercelAutomationBypass({}, true),
    {
      allowDuringTermination,
      timeoutMs: Math.min(
        EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS,
        remainingMs,
      ),
    },
  );
  const protectionBypass = Object.freeze({
    status: bypassObservation.status,
    redirected: bypassObservation.redirected,
    locationPresent: bypassObservation.locationPresent,
    responseUrlExact: bypassObservation.responseUrlExact,
    disposition: bypassObservation.disposition,
  });
  const bypassReachedExactApplicationGate =
    protectionBypass.status === 404 &&
    protectionBypass.redirected === false &&
    protectionBypass.locationPresent === false &&
    protectionBypass.responseUrlExact === true &&
    protectionBypass.disposition === "DEALFLOW_APPLICATION_GATE";
  const bypassReachedExactDeploymentAbsence =
    protectionBypass.status === 404 &&
    protectionBypass.redirected === false &&
    protectionBypass.locationPresent === false &&
    protectionBypass.responseUrlExact === true &&
    protectionBypass.disposition === "VERCEL_DEPLOYMENT_NOT_FOUND";
  return Object.freeze({
    ...publicObservation,
    disposition: bypassReachedExactApplicationGate
      ? "DEALFLOW_APPLICATION_GATE_BEHIND_VERCEL_AUTOMATION_PROTECTION"
      : bypassReachedExactDeploymentAbsence
        ? "VERCEL_DEPLOYMENT_NOT_FOUND_BEHIND_VERCEL_AUTOMATION_PROTECTION"
      : "VERCEL_AUTOMATION_PROTECTION",
    protectionBypass,
  });
}

async function waitForExactAppAliasPropagation(
  alias,
  evidenceDir,
  vercel,
  deployment,
) {
  let result;
  try {
    result = await waitForExactAliasPropagation({
      probe: ({ timeoutMs }) =>
        requestExactAppAliasEdgeObservation(alias, { timeoutMs }),
      verifyMapping: async ({ timeoutMs }) => {
        const mapping = await fetchExactAliasMapping(
          vercel,
          alias,
          `${alias.label} post-propagation alias`,
          { timeoutMs },
        );
        if (
          mapping?.deploymentId !== deployment.deploymentId ||
          mapping?.deploymentHost !== deployment.deploymentHost ||
          mapping?.projectIdFingerprint !== EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT
        ) {
          throw new Error(`${alias.label} staging app alias mapping drifted during edge propagation`);
        }
        return mapping;
      },
      delay: abortableDelay,
    });
  } catch (error) {
    const failureEvidence = summarizeExactAliasPropagationFailure(error);
    writeJson(
      join(evidenceDir, `alias-edge-propagation-${alias.label}.json`),
      {
        schemaVersion: "dealflow.vercel-alias-edge-propagation.v1",
        status: error instanceof ExactAliasPropagationTimeoutError
          ? "FAILED_TIMEOUT"
          : "FAILED_HARD",
        aliasLabel: alias.label,
        aliasHost: alias.host,
        expectedDeploymentId: deployment.deploymentId,
        expectedDeploymentHost: deployment.deploymentHost,
        projectIdFingerprint: EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT,
        timeoutMs: EXACT_ALIAS_PROPAGATION_TIMEOUT_MS,
        pollIntervalMs: EXACT_ALIAS_PROPAGATION_POLL_INTERVAL_MS,
        requestTimeoutMaximumMs: EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS,
        failurePhase: failureEvidence.failurePhase,
        requestAttemptCount: failureEvidence.requestAttemptCount,
        completedResponseCount: failureEvidence.completedResponseCount,
        elapsedMs: failureEvidence.elapsedMs,
        observations: failureEvidence.observations,
        terminalObservation: failureEvidence.terminalObservation,
        sanitizedFailureSha256: sha256(
          sanitize(error instanceof Error ? error.message : String(error), protectedRuntimeValues()),
        ),
        intermediateDispositionAllowed: "VERCEL_DEPLOYMENT_NOT_FOUND",
        requiredFinalDisposition:
          "DEALFLOW_APPLICATION_GATE_OR_EXACT_GATE_BEHIND_VERCEL_AUTOMATION_PROTECTION",
        exactCandidateMappingProvenBeforeWait: true,
        exactCandidateMappingProvenAfterWait: false,
        redirectsFollowed: failureEvidence.redirectsFollowed,
        responseUrlExact: failureEvidence.responseUrlExact,
        gateCredentialSentDuringWait: false,
        vercelAutomationBypassSecretSentOnlyToExactAlias: true,
        vercelAutomationBypassSecretPersistedToEvidence: false,
        publicWindowObserved: failureEvidence.publicWindowObserved,
        publicWindowProofStatus: failureEvidence.publicWindowProofStatus,
        productionOrSharedAliasChanged: false,
      },
      { allowDuringTermination: true },
    );
    throw error;
  }

  const proof = Object.freeze({
    schemaVersion: "dealflow.vercel-alias-edge-propagation.v1",
    status: "PASS",
    aliasLabel: alias.label,
    aliasHost: alias.host,
    expectedDeploymentId: deployment.deploymentId,
    expectedDeploymentHost: deployment.deploymentHost,
    projectIdFingerprint: EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT,
    timeoutMs: EXACT_ALIAS_PROPAGATION_TIMEOUT_MS,
    pollIntervalMs: EXACT_ALIAS_PROPAGATION_POLL_INTERVAL_MS,
    requestTimeoutMaximumMs: EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS,
    attemptCount: result.observations.length,
    transientDeploymentNotFoundCount: result.observations.filter(
      ({ disposition }) => disposition === "VERCEL_DEPLOYMENT_NOT_FOUND",
    ).length,
    vercelAutomationProtectionCount: result.observations.filter(
      ({ disposition }) =>
        disposition ===
        "DEALFLOW_APPLICATION_GATE_BEHIND_VERCEL_AUTOMATION_PROTECTION",
    ).length,
    vercelAutomationBypassRequired:
      result.observations.at(-1)?.vercelAutomationBypassUsed === true,
    elapsedMs: result.elapsedMs,
    firstDisposition: result.observations[0]?.disposition ?? null,
    finalDisposition: result.observations.at(-1)?.disposition ?? null,
    finalStatus: result.observations.at(-1)?.status ?? null,
    observations: result.observations,
    intermediateDispositionAllowed: "VERCEL_DEPLOYMENT_NOT_FOUND",
    requiredFinalDisposition:
      "DEALFLOW_APPLICATION_GATE_OR_EXACT_GATE_BEHIND_VERCEL_AUTOMATION_PROTECTION",
    persistentVercelProtectionAcceptedOnlyWithExactBypassGate: true,
    exactCandidateMappingProvenBeforeWait: true,
    exactCandidateMappingProvenAfterWait: true,
    postWaitMapping: result.mappingProof,
    redirectsFollowed: false,
    responseUrlExact: true,
    gateCredentialSentDuringWait: false,
    vercelAutomationBypassSecretSentOnlyToExactAlias: true,
    vercelAutomationBypassSecretPersistedToEvidence: false,
    publicWindowObserved: false,
    productionOrSharedAliasChanged: false,
  });
  writeJson(
    join(evidenceDir, `alias-edge-propagation-${alias.label}.json`),
    proof,
  );
  return proof;
}

async function proveClosedPreDeployAppAliasSurface() {
  if (
    new Set(EXPECTED_APP_ALIASES.map(({ host }) => host)).size !==
      EXPECTED_APP_ALIASES.length ||
    new Set(EXPECTED_APP_ALIASES.map(({ url }) => url)).size !==
      EXPECTED_APP_ALIASES.length
  ) {
    throw new Error("Direct and partner staging aliases must be exactly distinct");
  }
  const aliases = [];
  for (const alias of EXPECTED_APP_ALIASES) {
    const noGate = await requestExactAppAlias(alias);
    if (
      noGate.status !== 404 ||
      ![
        "VERCEL_DEPLOYMENT_NOT_FOUND",
        "DEALFLOW_APPLICATION_GATE",
      ].includes(noGate.disposition)
    ) {
      throw new Error(`${alias.label} was publicly reachable before staging deployment`);
    }
    aliases.push({
      label: alias.label,
      host: alias.host,
      noGate,
    });
  }
  return Object.freeze({
    status: "PASS",
    phase: "before_environment_and_deployment",
    aliasCount: aliases.length,
    aliases,
    gateCredentialSent: false,
    publicWindowObserved: false,
  });
}

function exactAliasRuntimeAccess(alias, propagationProof) {
  const exactAlias = EXPECTED_APP_ALIASES.find(
    ({ label, host, url }) =>
      label === alias?.label && host === alias?.host && url === alias?.url,
  );
  const bypassRequired = propagationProof?.vercelAutomationBypassRequired === true;
  if (
    !exactAlias ||
    propagationProof?.status !== "PASS" ||
    propagationProof.aliasLabel !== exactAlias.label ||
    propagationProof.aliasHost !== exactAlias.host ||
    (bypassRequired &&
      propagationProof.finalDisposition !==
        "DEALFLOW_APPLICATION_GATE_BEHIND_VERCEL_AUTOMATION_PROTECTION") ||
    (!bypassRequired &&
      propagationProof.finalDisposition !== "DEALFLOW_APPLICATION_GATE")
  ) {
    throw new Error("Alias runtime access requirement is not bound to exact propagation proof");
  }
  return Object.freeze({
    ...exactAlias,
    vercelAutomationBypassRequired: bypassRequired,
  });
}

function assertExactAliasRuntimeAccessPortfolio(aliasAccessRequirements) {
  if (
    !Array.isArray(aliasAccessRequirements) ||
    aliasAccessRequirements.length !== EXPECTED_APP_ALIASES.length ||
    aliasAccessRequirements.some((access, index) =>
      access?.label !== EXPECTED_APP_ALIASES[index].label ||
      access?.host !== EXPECTED_APP_ALIASES[index].host ||
      access?.url !== EXPECTED_APP_ALIASES[index].url ||
      typeof access.vercelAutomationBypassRequired !== "boolean"
    )
  ) {
    throw new Error("Alias runtime access portfolio is not exact");
  }
  return aliasAccessRequirements;
}

async function proveExactPostDeployAppAliasGate(aliasAccess) {
  const alias = aliasAccess;
  const { noGate, headerGate, cookieGate } =
    await proveSequentialExactApplicationGate({
      label: alias.label,
      request: (headers) => requestExactAppAlias(
        alias,
        withVercelAutomationBypass(
          headers,
          alias.vercelAutomationBypassRequired,
        ),
      ),
      getSecret: () => requiredEnvironment("STAGING_ACCESS_GATE_SECRET", 43),
      headerName: STAGING_ACCESS_HEADER,
      cookieName: STAGING_ACCESS_COOKIE,
    });
  return Object.freeze({
    label: alias.label,
    host: alias.host,
    noGate,
    headerGate,
    cookieGate,
    vercelAutomationBypassRequired:
      alias.vercelAutomationBypassRequired,
    vercelAutomationBypassSecretPersistedToEvidence: false,
  });
}

async function provePostDeployAppAliasGate(aliasAccessRequirements) {
  assertExactAliasRuntimeAccessPortfolio(aliasAccessRequirements);
  const aliases = [];
  for (const aliasAccess of aliasAccessRequirements) {
    aliases.push(await proveExactPostDeployAppAliasGate(aliasAccess));
  }
  return Object.freeze({
    status: "PASS",
    phase: "after_exact_deployment",
    aliasCount: aliases.length,
    aliases,
    noGateStatus: 404,
    headerGateStatus: 200,
    cookieGateStatus: 200,
    redirectsFollowed: false,
    vercelAutomationBypassAliasCount: aliases.filter(
      ({ vercelAutomationBypassRequired }) =>
        vercelAutomationBypassRequired,
    ).length,
    secretsPersistedToEvidence: false,
  });
}

async function requestExactGatedAsset(alias, resourcePath, headers = {}) {
  const endpoint = new URL(resourcePath, alias.url);
  if (
    endpoint.origin !== alias.url ||
    !(
      endpoint.pathname.startsWith("/_next/static/") ||
      endpoint.pathname === NEXT_IMAGE_OPTIMIZER_PATH ||
      endpoint.pathname === VERCEL_NATIVE_IMAGE_OPTIMIZER_PATH ||
      endpoint.pathname === DISABLED_STAGING_IMAGE_OPTIMIZER_PATH
    ) ||
    endpoint.username !== "" ||
    endpoint.password !== ""
  ) {
    throw new Error("Static gate proof received a non-exact resource path");
  }
  const response = await executionFetch(endpoint, {
    headers: {
      Accept: "*/*",
      "User-Agent": "DealFlow-Staging-Static-Gate/1.0",
      ...withVercelAutomationBypass(
        headers,
        alias.vercelAutomationBypassRequired,
      ),
    },
    redirect: "manual",
  }, 20_000);
  const body = Buffer.from(await response.arrayBuffer());
  if (
    response.url !== endpoint.toString() ||
    response.redirected ||
    response.headers.has("location")
  ) {
    throw new Error(`${alias.label} static gate request changed URL`);
  }
  const common = {
    status: response.status,
    contentType: (response.headers.get("content-type") ?? "").split(";")[0],
    bodyBytes: body.length,
    cacheControl: response.headers.get("cache-control") ?? "",
    robotsTag: response.headers.get("x-robots-tag") ?? "",
    redirectFollowed: false,
    responseUrlExact: true,
    vercelAutomationBypassRequired:
      alias.vercelAutomationBypassRequired,
  };
  if (
    endpoint.pathname === NEXT_IMAGE_OPTIMIZER_PATH ||
    endpoint.pathname === VERCEL_NATIVE_IMAGE_OPTIMIZER_PATH
  ) {
    return Object.freeze({
      ...classifyExactNextImageOptimizerRejection({
        ...common,
        body,
        vercelError: response.headers.get("x-vercel-error"),
        locationPresent: false,
      }),
      robotsTag: common.robotsTag,
      vercelAutomationBypassRequired:
        alias.vercelAutomationBypassRequired,
    });
  }
  return Object.freeze({
    ...common,
    bodySha256: sha256(body),
    vercelErrorPresent: response.headers.has("x-vercel-error"),
  });
}

async function requestExactPrivateImageSource(
  alias,
  resourcePath,
  expectedReleaseCommit,
  headers = {},
  { forbiddenQuery = false } = {},
) {
  const endpoint = new URL(resourcePath, alias.url);
  if (forbiddenQuery) {
    endpoint.searchParams.set("cache-bypass", "forbidden");
  }
  if (
    endpoint.origin !== alias.url ||
    endpoint.pathname !==
      `${STAGING_PRIVATE_IMAGE_SOURCE_PATH_PREFIX}${expectedReleaseCommit}.png` ||
    !/^[0-9a-f]{40}$/.test(expectedReleaseCommit) ||
    endpoint.search !== (forbiddenQuery ? "?cache-bypass=forbidden" : "") ||
    endpoint.hash !== "" ||
    endpoint.username !== "" ||
    endpoint.password !== ""
  ) {
    throw new Error("Private image source proof received a non-exact staging resource");
  }
  const response = await executionFetch(endpoint, {
    headers: {
      Accept: "image/png",
      "User-Agent": "DealFlow-Staging-Private-Image-Source-Proof/2.0",
      ...withVercelAutomationBypass(
        headers,
        alias.vercelAutomationBypassRequired,
      ),
    },
    redirect: "manual",
  }, 20_000);
  const body = Buffer.from(await response.arrayBuffer());
  if (
    response.url !== endpoint.toString() ||
    response.redirected ||
    response.headers.has("location")
  ) {
    throw new Error(`${alias.label} private image source request changed URL`);
  }
  return Object.freeze({
    status: response.status,
    contentType: (response.headers.get("content-type") ?? "").split(";")[0],
    bodySha256: sha256(body),
    bodyBytes: body.length,
    cacheControl: response.headers.get("cache-control") ?? "",
    robotsTag: response.headers.get("x-robots-tag") ?? "",
    vercelErrorPresent: response.headers.has("x-vercel-error"),
    redirectFollowed: false,
    responseUrlExact: true,
    vercelAutomationBypassRequired:
      alias.vercelAutomationBypassRequired,
  });
}

function exactHostedDirectPublicImageExpectation(asset) {
  const approved = APPROVED_DIRECT_PUBLIC_IMAGE_ASSETS.find(
    (candidate) => candidate.bodySha256 === asset?.bodySha256,
  );
  const contentType =
    EXACT_HOSTED_DIRECT_PUBLIC_IMAGE_CONTENT_TYPE_BY_IDENTITY[
      asset?.bodySha256
    ];
  if (
    !approved ||
    JSON.stringify(approved) !== JSON.stringify(asset) ||
    typeof contentType !== "string" ||
    Object.keys(EXACT_HOSTED_DIRECT_PUBLIC_IMAGE_CONTENT_TYPE_BY_IDENTITY)
      .length !== APPROVED_DIRECT_PUBLIC_IMAGE_ASSETS.length
  ) {
    throw new Error("Hosted direct public image expectation was not exact");
  }
  return Object.freeze({
    bodyBytes: asset.bodyBytes,
    bodySha256: asset.bodySha256,
    contentType,
  });
}

async function requestExactDirectPublicImage(alias, asset, headers = {}) {
  const approved = APPROVED_DIRECT_PUBLIC_IMAGE_ASSETS.find(
    (candidate) => candidate.resourcePath === asset?.resourcePath,
  );
  if (!approved || JSON.stringify(approved) !== JSON.stringify(asset)) {
    throw new Error("Direct public image proof received an unapproved asset identity");
  }
  const hostedExpectation = exactHostedDirectPublicImageExpectation(asset);
  const endpoint = new URL(asset.resourcePath, alias.url);
  if (
    endpoint.origin !== alias.url ||
    endpoint.pathname !== asset.resourcePath ||
    endpoint.search !== "" ||
    endpoint.hash !== "" ||
    endpoint.username !== "" ||
    endpoint.password !== ""
  ) {
    throw new Error("Direct public image proof received a non-exact resource");
  }
  const response = await executionFetch(endpoint, {
    headers: {
      Accept: hostedExpectation.contentType,
      "User-Agent": "DealFlow-Staging-Direct-Public-Image-Proof/1.0",
      ...withVercelAutomationBypass(
        headers,
        alias.vercelAutomationBypassRequired,
      ),
    },
    redirect: "manual",
  }, 20_000);
  const body = Buffer.from(await response.arrayBuffer());
  if (
    response.url !== endpoint.toString() ||
    response.redirected ||
    response.headers.has("location")
  ) {
    throw new Error(`${alias.label} direct public image request changed URL`);
  }
  const edgeCache = sanitizeApprovedDirectPublicImageEdgeCache({
    xVercelCache: response.headers.get("x-vercel-cache"),
    age: response.headers.get("age"),
  });
  return Object.freeze({
    status: response.status,
    contentType: (response.headers.get("content-type") ?? "").split(";")[0],
    bodyBytes: body.length,
    bodySha256: sha256(body),
    cacheControl: response.headers.get("cache-control") ?? "",
    robotsTag: response.headers.get("x-robots-tag") ?? "",
    vercelErrorPresent: response.headers.has("x-vercel-error"),
    redirectFollowed: false,
    responseUrlExact: true,
    vercelAutomationBypassRequired:
      alias.vercelAutomationBypassRequired,
    ...edgeCache,
  });
}

async function requestExactDynamicImageSource(
  alias,
  resourcePath,
  headers = {},
) {
  if (
    ![
      OPEN_GRAPH_IMAGE_SOURCE_PATH,
      INVALID_SIGNED_PROVIDER_IMAGE_SOURCE_PATH,
    ].includes(resourcePath)
  ) {
    throw new Error("Dynamic image source proof received an unapproved route");
  }
  const endpoint = new URL(resourcePath, alias.url);
  if (
    endpoint.origin !== alias.url ||
    endpoint.pathname !== resourcePath ||
    endpoint.search !== "" ||
    endpoint.hash !== "" ||
    endpoint.username !== "" ||
    endpoint.password !== ""
  ) {
    throw new Error("Dynamic image source proof received a non-exact route");
  }
  const response = await executionFetch(endpoint, {
    headers: {
      Accept: "image/*",
      "User-Agent": "DealFlow-Staging-Dynamic-Image-Source-Proof/1.0",
      ...withVercelAutomationBypass(
        headers,
        alias.vercelAutomationBypassRequired,
      ),
    },
    redirect: "manual",
  }, 20_000);
  const body = Buffer.from(await response.arrayBuffer());
  if (
    response.url !== endpoint.toString() ||
    response.redirected ||
    response.headers.has("location")
  ) {
    throw new Error(`${alias.label} dynamic image source request changed URL`);
  }
  return Object.freeze({
    status: response.status,
    contentType: (response.headers.get("content-type") ?? "").split(";")[0],
    bodyBytes: body.length,
    bodySha256: sha256(body),
    cacheControl: response.headers.get("cache-control") ?? "",
    robotsTag: response.headers.get("x-robots-tag") ?? "",
    vercelErrorPresent: response.headers.has("x-vercel-error"),
    redirectFollowed: false,
    responseUrlExact: true,
    vercelAutomationBypassRequired:
      alias.vercelAutomationBypassRequired,
  });
}

async function requestExactRetiredImageSource(alias, headers = {}) {
  const endpoint = new URL(RETIRED_PUBLIC_IMAGE_SOURCE_PATH, alias.url);
  if (
    endpoint.origin !== alias.url ||
    endpoint.pathname !== RETIRED_PUBLIC_IMAGE_SOURCE_PATH ||
    endpoint.search !== "" ||
    endpoint.hash !== "" ||
    endpoint.username !== "" ||
    endpoint.password !== ""
  ) {
    throw new Error("Retired image source proof received a non-exact staging resource");
  }
  const response = await executionFetch(endpoint, {
    headers: {
      Accept: "image/png",
      "User-Agent": "DealFlow-Staging-Retired-Image-Source-Proof/1.0",
      ...withVercelAutomationBypass(
        headers,
        alias.vercelAutomationBypassRequired,
      ),
    },
    redirect: "manual",
  }, 20_000);
  const body = Buffer.from(await response.arrayBuffer());
  if (
    response.url !== endpoint.toString() ||
    response.redirected ||
    response.headers.has("location")
  ) {
    throw new Error(`${alias.label} retired image source request changed URL`);
  }
  return Object.freeze({
    status: response.status,
    contentType: (response.headers.get("content-type") ?? "").split(";")[0],
    bodyBytes: body.length,
    bodySha256: sha256(body),
    cacheControl: response.headers.get("cache-control") ?? "",
    robotsTag: response.headers.get("x-robots-tag") ?? "",
    vercelErrorPresent: response.headers.has("x-vercel-error"),
    redirectFollowed: false,
    vercelAutomationBypassRequired:
      alias.vercelAutomationBypassRequired,
  });
}

function buildExactImageOptimizerPaths(sourceResourcePath) {
  const source = new URL(sourceResourcePath, EXPECTED_STAGING_BASE_URL);
  if (
    source.origin !== EXPECTED_STAGING_BASE_URL ||
    source.pathname !== sourceResourcePath ||
    source.search !== "" ||
    source.hash !== "" ||
    !sourceResourcePath.startsWith("/")
  ) {
    throw new Error("Image optimizer proof requires an exact same-origin no-query source path");
  }
  const defaultOptimizer = new URL(
    NEXT_IMAGE_OPTIMIZER_PATH,
    EXPECTED_STAGING_BASE_URL,
  );
  const vercelNativeOptimizer = new URL(
    VERCEL_NATIVE_IMAGE_OPTIMIZER_PATH,
    EXPECTED_STAGING_BASE_URL,
  );
  const disabledOptimizer = new URL(
    DISABLED_STAGING_IMAGE_OPTIMIZER_PATH,
    EXPECTED_STAGING_BASE_URL,
  );
  for (const optimizer of [
    defaultOptimizer,
    vercelNativeOptimizer,
    disabledOptimizer,
  ]) {
    optimizer.searchParams.set("url", sourceResourcePath);
    optimizer.searchParams.set("w", "32");
    optimizer.searchParams.set("q", "75");
  }
  return Object.freeze({
    defaultOptimizerResourcePath:
      `${defaultOptimizer.pathname}${defaultOptimizer.search}`,
    vercelNativeOptimizerResourcePath:
      `${vercelNativeOptimizer.pathname}${vercelNativeOptimizer.search}`,
    disabledOptimizerResourcePath:
      `${disabledOptimizer.pathname}${disabledOptimizer.search}`,
  });
}

function buildVersionedPrivateImagePaths(identity) {
  if (!identity || !/^[0-9a-f]{40}$/.test(identity.commit)) {
    throw new Error("Private image proof requires the exact candidate commit");
  }
  const source = new URL(
    `${STAGING_PRIVATE_IMAGE_SOURCE_PATH_PREFIX}${identity.commit}.png`,
    EXPECTED_STAGING_BASE_URL,
  );
  const sourceResourcePath = source.pathname;
  const optimizerPaths = buildExactImageOptimizerPaths(sourceResourcePath);
  const legacyOptimizerPaths = buildExactImageOptimizerPaths(
    RETIRED_PUBLIC_IMAGE_SOURCE_PATH,
  );
  return Object.freeze({
    sourceResourcePath,
    ...optimizerPaths,
    legacyOptimizerResourcePath:
      legacyOptimizerPaths.defaultOptimizerResourcePath,
    legacyVercelNativeOptimizerResourcePath:
      legacyOptimizerPaths.vercelNativeOptimizerResourcePath,
    releaseCommit: identity.commit,
  });
}

function isExactDealFlowApplicationGateResponse(result) {
  return (
    result.status === 404 &&
    result.contentType === "application/json" &&
    result.bodyBytes === DEALFLOW_NOT_FOUND_BODY_BYTES &&
    result.bodySha256 === DEALFLOW_NOT_FOUND_BODY_SHA256 &&
    /(?:^|,)\s*(?:private\s*,\s*)?no-store(?:\s|,|$)/i.test(result.cacheControl) &&
    /noindex/i.test(result.robotsTag) &&
    result.vercelErrorPresent === false
  );
}

function isExactPrivateImageRouteNotFoundResponse(result) {
  return (
    result.status === 404 &&
    result.contentType === "text/plain" &&
    result.bodyBytes === PRIVATE_IMAGE_ROUTE_NOT_FOUND_BODY_BYTES &&
    result.bodySha256 === PRIVATE_IMAGE_ROUTE_NOT_FOUND_BODY_SHA256 &&
    /(?:^|,)\s*private\s*,\s*no-store\s*,\s*max-age=0(?:\s*,|$)/i.test(
      result.cacheControl,
    ) &&
    /noindex/i.test(result.robotsTag) &&
    result.vercelErrorPresent === false &&
    result.redirectFollowed === false &&
    result.responseUrlExact === true
  );
}

function isExactApprovedDirectPublicImageResponse(result, asset) {
  return (
    result.status === 200 &&
    result.contentType === asset.contentType &&
    result.bodyBytes === asset.bodyBytes &&
    result.bodySha256 === asset.bodySha256 &&
    result.vercelErrorPresent === false &&
    result.redirectFollowed === false &&
    result.responseUrlExact === true
  );
}

async function collectExactSixModeGateMatrix(request, secret) {
  return Object.freeze({
    noGateBeforeWarm: await request({}),
    headerGate: await request({ [STAGING_ACCESS_HEADER]: secret }),
    cookieGate: await request({
      Cookie: `${STAGING_ACCESS_COOKIE}=${secret}`,
    }),
    noGateAfterWarm: await request({}),
    invalidHeaderAfterWarm: await request({
      [STAGING_ACCESS_HEADER]: "W".repeat(secret.length),
    }),
    invalidCookieAfterWarm: await request({
      Cookie: `${STAGING_ACCESS_COOKIE}=${"W".repeat(secret.length)}`,
    }),
  });
}

async function proveExactProviderOptimizerMatrices({
  alias,
  optimizerPaths,
  secret,
  proofLabel,
}) {
  const nextOptimizer = await collectExactSixModeGateMatrix(
    (headers) => requestExactGatedAsset(
      alias,
      optimizerPaths.defaultOptimizerResourcePath,
      headers,
    ),
    secret,
  );
  const vercelNativeOptimizer = await collectExactSixModeGateMatrix(
    (headers) => requestExactGatedAsset(
      alias,
      optimizerPaths.vercelNativeOptimizerResourcePath,
      headers,
    ),
    secret,
  );
  let nextOptimizerDisposition;
  let vercelNativeOptimizerDisposition;
  try {
    nextOptimizerDisposition =
      assertExactNextImageOptimizerSixModeMatrix(nextOptimizer);
    vercelNativeOptimizerDisposition =
      assertExactNextImageOptimizerSixModeMatrix(vercelNativeOptimizer);
  } catch {
    throw new Error(
      `${alias.label} ${proofLabel} provider optimizer response was not exact`,
    );
  }
  if (nextOptimizerDisposition !== vercelNativeOptimizerDisposition) {
    throw new Error(
      `${alias.label} ${proofLabel} provider optimizer paths did not classify identically`,
    );
  }
  return Object.freeze({
    nextOptimizer,
    vercelNativeOptimizer,
    providerOptimizerDisposition: nextOptimizerDisposition,
    bothProviderPathsClassifiedIdentically: true,
    allSixModesClassifiedIdenticallyPerProviderPath: true,
    nonDataProviderRejectionProven: true,
    optimizedImageReturned: false,
  });
}

async function proveApprovedDirectPublicImageMatrix(alias, aliasOrdinal, secret) {
  const assets = [];
  const checkpointEvaluations = [];
  const checkpointPath = join(
    failureContext.evidenceDir,
    `approved-direct-public-image-matrix-checkpoint-${String(aliasOrdinal).padStart(2, "0")}.json`,
  );
  for (const [assetIndex, asset] of APPROVED_DIRECT_PUBLIC_IMAGE_ASSETS.entries()) {
    const hostedExpectation = exactHostedDirectPublicImageExpectation(asset);
    const optimizerPaths = buildExactImageOptimizerPaths(asset.resourcePath);
    const direct = await collectExactSixModeGateMatrix(
      (headers) => requestExactDirectPublicImage(alias, asset, headers),
      secret,
    );
    const checkpointEvaluation =
      evaluateApprovedDirectPublicImageSixModeMatrix({
        assetOrdinal: assetIndex + 1,
        asset: hostedExpectation,
        matrix: direct,
        gateContract: APPROVED_DIRECT_PUBLIC_IMAGE_GATE_CHECKPOINT_CONTRACT,
      });
    checkpointEvaluations.push(checkpointEvaluation);
    const checkpoint = buildApprovedDirectPublicImageMatrixCheckpoint({
      aliasOrdinal,
      aliasLabel: alias.label,
      totalAssetCount: APPROVED_DIRECT_PUBLIC_IMAGE_ASSETS.length,
      evaluations: checkpointEvaluations,
    });
    writeAtomicApprovedDirectPublicImageMatrixCheckpoint(
      checkpointPath,
      checkpoint,
    );
    if (
      !isExactDealFlowApplicationGateResponse(direct.noGateBeforeWarm) ||
      !isExactApprovedDirectPublicImageResponse(
        direct.headerGate,
        hostedExpectation,
      ) ||
      !isExactApprovedDirectPublicImageResponse(
        direct.cookieGate,
        hostedExpectation,
      ) ||
      !isExactDealFlowApplicationGateResponse(direct.noGateAfterWarm) ||
      !isExactDealFlowApplicationGateResponse(direct.invalidHeaderAfterWarm) ||
      !isExactDealFlowApplicationGateResponse(direct.invalidCookieAfterWarm) ||
      checkpointEvaluation.matrixStatus !== "PASS"
    ) {
      const exactFailure = checkpointEvaluation.failures[0] ?? {
        assetOrdinal: assetIndex + 1,
        mode: "matrixContractDivergence",
        failedPredicates: ["strictContractDivergence"],
      };
      throw new Error(
        `${alias.label} approved direct public image gate matrix failed assetOrdinal=${exactFailure.assetOrdinal} mode=${exactFailure.mode} failedPredicates=${exactFailure.failedPredicates.join(",")}`,
      );
    }

    const providerOptimizers = await proveExactProviderOptimizerMatrices({
      alias,
      optimizerPaths,
      secret,
      proofLabel: "approved direct image",
    });

    const disabledOptimizer = await collectExactSixModeGateMatrix(
      (headers) => requestExactGatedAsset(
        alias,
        optimizerPaths.disabledOptimizerResourcePath,
        headers,
      ),
      secret,
    );
    if (
      Object.values(disabledOptimizer).some(
        (result) => !isExactDealFlowApplicationGateResponse(result),
      )
    ) {
      throw new Error(`${alias.label} approved direct image custom optimizer response was not exact`);
    }

    assets.push(Object.freeze({
      assetIdentity: asset.bodySha256,
      sourceInventoryContentType: asset.contentType,
      hostedContentType: hostedExpectation.contentType,
      bodyBytes: asset.bodyBytes,
      direct,
      defaultOptimizer: providerOptimizers.nextOptimizer,
      vercelNativeOptimizer: providerOptimizers.vercelNativeOptimizer,
      disabledOptimizer,
      sameOriginRequestsOnly: true,
      defaultOptimizerDisposition:
        providerOptimizers.providerOptimizerDisposition,
      vercelNativeOptimizerDisposition:
        providerOptimizers.providerOptimizerDisposition,
      disabledOptimizerDisposition: "DEALFLOW_APPLICATION_GATE",
      defaultOptimizerSixModesClassifiedIdentically: true,
      vercelNativeOptimizerSixModesClassifiedIdentically: true,
      bothProviderPathsClassifiedIdentically: true,
      optimizedImageReturned: false,
    }));
  }
  return Object.freeze({
    status: "PASS",
    approvedAssetCount: assets.length,
    checkpointFile: basename(checkpointPath),
    checkpointStatus: "PASS",
    checkpointAtomicallyPersistedBeforeEachMatrixAssertion: true,
    localSourceInventoryAndHostedMimeContractsDistinguished: true,
    fullSixModeMatrixPerAsset: true,
    noAndInvalidGateRecheckedAfterWarm: true,
    exactSourceBytesVerifiedForHeaderAndCookie: true,
    bothProviderAndCustomOptimizerPathsProvenPerAsset: true,
    assets,
  });
}

function isExactDynamicOpenGraphImageResponse(result) {
  return (
    result.status === 200 &&
    result.contentType === "image/png" &&
    result.bodyBytes > 1_000 &&
    /^[a-f0-9]{64}$/.test(result.bodySha256) &&
    result.vercelErrorPresent === false &&
    result.redirectFollowed === false &&
    result.responseUrlExact === true
  );
}

function isExactInvalidSignedProviderImageResponse(result) {
  return (
    result.status === 404 &&
    result.contentType === "application/json" &&
    result.bodyBytes === INVALID_SIGNED_PROVIDER_IMAGE_BODY_BYTES &&
    result.bodySha256 === INVALID_SIGNED_PROVIDER_IMAGE_BODY_SHA256 &&
    result.vercelErrorPresent === false &&
    result.redirectFollowed === false &&
    result.responseUrlExact === true
  );
}

async function proveDynamicImageSourceMatrix(alias, secret) {
  const proveOptimizerPair = async (resourcePath) => {
    const optimizerPaths = buildExactImageOptimizerPaths(resourcePath);
    const providerOptimizers = await proveExactProviderOptimizerMatrices({
      alias,
      optimizerPaths,
      secret,
      proofLabel: "dynamic image",
    });
    const disabledOptimizer = await collectExactSixModeGateMatrix(
      (headers) => requestExactGatedAsset(
        alias,
        optimizerPaths.disabledOptimizerResourcePath,
        headers,
      ),
      secret,
    );
    if (
      Object.values(disabledOptimizer).some(
        (result) => !isExactDealFlowApplicationGateResponse(result),
      )
    ) {
      throw new Error(`${alias.label} dynamic image custom optimizer response was not exact`);
    }
    return Object.freeze({
      defaultOptimizer: providerOptimizers.nextOptimizer,
      vercelNativeOptimizer: providerOptimizers.vercelNativeOptimizer,
      disabledOptimizer,
      defaultOptimizerDisposition:
        providerOptimizers.providerOptimizerDisposition,
      vercelNativeOptimizerDisposition:
        providerOptimizers.providerOptimizerDisposition,
      disabledOptimizerDisposition: "DEALFLOW_APPLICATION_GATE",
      defaultOptimizerSixModesClassifiedIdentically: true,
      vercelNativeOptimizerSixModesClassifiedIdentically: true,
      bothProviderPathsClassifiedIdentically: true,
      optimizedImageReturned: false,
    });
  };

  const openGraphDirect = await collectExactSixModeGateMatrix(
    (headers) => requestExactDynamicImageSource(
      alias,
      OPEN_GRAPH_IMAGE_SOURCE_PATH,
      headers,
    ),
    secret,
  );
  if (
    !isExactDealFlowApplicationGateResponse(openGraphDirect.noGateBeforeWarm) ||
    !isExactDynamicOpenGraphImageResponse(openGraphDirect.headerGate) ||
    !isExactDynamicOpenGraphImageResponse(openGraphDirect.cookieGate) ||
    openGraphDirect.headerGate.bodyBytes !== openGraphDirect.cookieGate.bodyBytes ||
    openGraphDirect.headerGate.bodySha256 !== openGraphDirect.cookieGate.bodySha256 ||
    !isExactDealFlowApplicationGateResponse(openGraphDirect.noGateAfterWarm) ||
    !isExactDealFlowApplicationGateResponse(openGraphDirect.invalidHeaderAfterWarm) ||
    !isExactDealFlowApplicationGateResponse(openGraphDirect.invalidCookieAfterWarm)
  ) {
    throw new Error(`${alias.label} dynamic open-graph image gate matrix failed`);
  }
  const openGraphOptimizers = await proveOptimizerPair(OPEN_GRAPH_IMAGE_SOURCE_PATH);

  const signedProviderDirect = await collectExactSixModeGateMatrix(
    (headers) => requestExactDynamicImageSource(
      alias,
      INVALID_SIGNED_PROVIDER_IMAGE_SOURCE_PATH,
      headers,
    ),
    secret,
  );
  if (
    !isExactDealFlowApplicationGateResponse(signedProviderDirect.noGateBeforeWarm) ||
    !isExactInvalidSignedProviderImageResponse(signedProviderDirect.headerGate) ||
    !isExactInvalidSignedProviderImageResponse(signedProviderDirect.cookieGate) ||
    !isExactDealFlowApplicationGateResponse(signedProviderDirect.noGateAfterWarm) ||
    !isExactDealFlowApplicationGateResponse(signedProviderDirect.invalidHeaderAfterWarm) ||
    !isExactDealFlowApplicationGateResponse(signedProviderDirect.invalidCookieAfterWarm)
  ) {
    throw new Error(`${alias.label} signed provider image authorization matrix failed`);
  }
  const signedProviderOptimizers = await proveOptimizerPair(
    INVALID_SIGNED_PROVIDER_IMAGE_SOURCE_PATH,
  );

  return Object.freeze({
    status: "PASS",
    dynamicImageSourceCount: 2,
    openGraph: {
      direct: openGraphDirect,
      ...openGraphOptimizers,
      exactRepeatedValidBodyIdentity: true,
    },
    signedProviderMedia: {
      direct: signedProviderDirect,
      ...signedProviderOptimizers,
      validProviderSignatureSupplied: false,
      providerOrDatabaseFetchReached: false,
      exactInvalidSignatureResponse: true,
    },
    fullSixModeMatrixPerSource: true,
    bothProviderAndCustomOptimizerPathsProvenPerSource: true,
  });
}

function isExactPrivateImageSourceResponse(result) {
  return (
    result.status === 200 &&
    result.contentType === "image/png" &&
    result.bodyBytes === STAGING_PRIVATE_IMAGE_SOURCE_BODY_BYTES &&
    result.bodySha256 === STAGING_PRIVATE_IMAGE_SOURCE_BODY_SHA256 &&
    /no-store/i.test(result.cacheControl) &&
    /noindex/i.test(result.robotsTag) &&
    result.vercelErrorPresent === false
  );
}

async function provePostDeployStaticAssetGate(
  aliasAccessRequirements,
  identity,
  hostedExactCandidateEnumeratedImagePortfolioProof,
) {
  assertExactAliasRuntimeAccessPortfolio(aliasAccessRequirements);
  if (
    hostedExactCandidateEnumeratedImagePortfolioProof?.status !== "PASS" ||
    hostedExactCandidateEnumeratedImagePortfolioProof.remotePatternCount !== 0 ||
    hostedExactCandidateEnumeratedImagePortfolioProof.domainCount !== 0 ||
    hostedExactCandidateEnumeratedImagePortfolioProof.localPatternCount !== 1 ||
    hostedExactCandidateEnumeratedImagePortfolioProof.onlyCompiledStaticMediaLocalPattern !== true ||
    hostedExactCandidateEnumeratedImagePortfolioProof.optimizerEligibleStaticMediaAssetCount !== 0 ||
    hostedExactCandidateEnumeratedImagePortfolioProof.compiledConfigurationCompatibleWithEnumeratedPortfolioClosure !== true ||
    hostedExactCandidateEnumeratedImagePortfolioProof.authoritativeHostedOutputInventoryProven !== false ||
    hostedExactCandidateEnumeratedImagePortfolioProof.hostedCompiledStaticMediaNamespaceAllowed !== true ||
    hostedExactCandidateEnumeratedImagePortfolioProof.manifestBoundSourcePortfolioHasZeroEligibleStaticMediaAssets !== true ||
    hostedExactCandidateEnumeratedImagePortfolioProof.rawDeploymentMetadataPersisted !== false ||
    hostedExactCandidateEnumeratedImagePortfolioProof.deploymentIdPersistedInThisProof !== false ||
    hostedExactCandidateEnumeratedImagePortfolioProof.projectIdPersistedInThisProof !== false ||
    hostedExactCandidateEnumeratedImagePortfolioProof.sanitizedShape?.unrecognizedKeyCount !== 0 ||
    hostedExactCandidateEnumeratedImagePortfolioProof.exactCandidateCommitMatchedBeforeConfigurationProof !== true ||
    hostedExactCandidateEnumeratedImagePortfolioProof.exactCandidateTreeMatchedBeforeConfigurationProof !== true ||
    hostedExactCandidateEnumeratedImagePortfolioProof.exactIsolatedStagingProjectMatchedBeforeConfigurationProof !== true ||
    hostedExactCandidateEnumeratedImagePortfolioProof.deployableManifestBoundImageInventoryMatched !== true
  ) {
    throw new Error(
      "Static asset proof requires the exact sanitized deployed configuration to be compatible with later enumerated-source closure",
    );
  }
  const secret = requiredEnvironment("STAGING_ACCESS_GATE_SECRET", 43);
  const privateImagePaths = buildVersionedPrivateImagePaths(identity);
  const stableAliasAccess = aliasAccessRequirements[0];
  const privacyResponse = await executionFetch(
    new URL("/privacy", EXPECTED_STAGING_BASE_URL),
    {
      headers: withVercelAutomationBypass(
        withStagingAccess({ Accept: "text/html" }),
        stableAliasAccess.vercelAutomationBypassRequired,
      ),
      redirect: "manual",
    },
    20_000,
  );
  const privacyHtml = await privacyResponse.text();
  const chunkPath = findExactNextStaticChunkPath(
    privacyHtml,
    EXPECTED_STAGING_BASE_URL,
  );
  if (privacyResponse.status !== 200 || !chunkPath) {
    throw new Error("Could not discover a real gated Next.js chunk from the exact deployment");
  }
  const aliases = [];
  for (const [aliasIndex, alias] of aliasAccessRequirements.entries()) {
    const retiredPublicImageSource = await collectExactSixModeGateMatrix(
      (headers) => requestExactRetiredImageSource(alias, headers),
      secret,
    );
    if (
      Object.values(retiredPublicImageSource).some(
        (result) => !isExactDealFlowApplicationGateResponse(result),
      )
    ) {
      throw new Error(`${alias.label} retired public image source remains reachable`);
    }

    const privateImageSource = {
      noGateBeforeWarm: await requestExactPrivateImageSource(
        alias,
        privateImagePaths.sourceResourcePath,
        privateImagePaths.releaseCommit,
      ),
      headerGate: await requestExactPrivateImageSource(
        alias,
        privateImagePaths.sourceResourcePath,
        privateImagePaths.releaseCommit,
        { [STAGING_ACCESS_HEADER]: secret },
      ),
      cookieGate: await requestExactPrivateImageSource(
        alias,
        privateImagePaths.sourceResourcePath,
        privateImagePaths.releaseCommit,
        { Cookie: `${STAGING_ACCESS_COOKIE}=${secret}` },
      ),
      noGateAfterWarm: await requestExactPrivateImageSource(
        alias,
        privateImagePaths.sourceResourcePath,
        privateImagePaths.releaseCommit,
      ),
      invalidHeaderAfterWarm: await requestExactPrivateImageSource(
        alias,
        privateImagePaths.sourceResourcePath,
        privateImagePaths.releaseCommit,
        { [STAGING_ACCESS_HEADER]: "W".repeat(secret.length) },
      ),
      invalidCookieAfterWarm: await requestExactPrivateImageSource(
        alias,
        privateImagePaths.sourceResourcePath,
        privateImagePaths.releaseCommit,
        { Cookie: `${STAGING_ACCESS_COOKIE}=${"W".repeat(secret.length)}` },
      ),
      forbiddenQueryWithValidHeader: await requestExactPrivateImageSource(
        alias,
        privateImagePaths.sourceResourcePath,
        privateImagePaths.releaseCommit,
        { [STAGING_ACCESS_HEADER]: secret },
        { forbiddenQuery: true },
      ),
    };
    if (
      !isExactDealFlowApplicationGateResponse(
        privateImageSource.noGateBeforeWarm,
      ) ||
      !isExactPrivateImageSourceResponse(privateImageSource.headerGate) ||
      !isExactPrivateImageSourceResponse(privateImageSource.cookieGate) ||
      !isExactDealFlowApplicationGateResponse(
        privateImageSource.noGateAfterWarm,
      ) ||
      !isExactDealFlowApplicationGateResponse(
        privateImageSource.invalidHeaderAfterWarm,
      ) ||
      !isExactDealFlowApplicationGateResponse(
        privateImageSource.invalidCookieAfterWarm,
      ) ||
      !isExactPrivateImageRouteNotFoundResponse(
        privateImageSource.forbiddenQueryWithValidHeader,
      )
    ) {
      throw new Error(
        `${alias.label} private image source bypassed or failed the application gate`,
      );
    }
    const chunk = {
      noGateBeforeWarm: await requestExactGatedAsset(alias, chunkPath),
      headerGate: await requestExactGatedAsset(alias, chunkPath, {
        [STAGING_ACCESS_HEADER]: secret,
      }),
      cookieGate: await requestExactGatedAsset(alias, chunkPath, {
        Cookie: `${STAGING_ACCESS_COOKIE}=${secret}`,
      }),
      noGateAfterWarm: await requestExactGatedAsset(alias, chunkPath),
      invalidHeaderAfterWarm: await requestExactGatedAsset(alias, chunkPath, {
        [STAGING_ACCESS_HEADER]: "W".repeat(secret.length),
      }),
      invalidCookieAfterWarm: await requestExactGatedAsset(alias, chunkPath, {
        Cookie: `${STAGING_ACCESS_COOKIE}=${"W".repeat(secret.length)}`,
      }),
    };
    if (
      !isExactDealFlowApplicationGateResponse(chunk.noGateBeforeWarm) ||
      chunk.headerGate.status !== 200 ||
      chunk.cookieGate.status !== 200 ||
      !/(?:javascript|ecmascript)/i.test(chunk.headerGate.contentType) ||
      !/(?:javascript|ecmascript)/i.test(chunk.cookieGate.contentType) ||
      !isExactDealFlowApplicationGateResponse(chunk.noGateAfterWarm) ||
      !isExactDealFlowApplicationGateResponse(chunk.invalidHeaderAfterWarm) ||
      !isExactDealFlowApplicationGateResponse(chunk.invalidCookieAfterWarm)
    ) {
      throw new Error(`${alias.label} chunk resource bypassed or failed the application gate`);
    }

    const providerOptimizers = await proveExactProviderOptimizerMatrices({
      alias,
      optimizerPaths: privateImagePaths,
      secret,
      proofLabel: "versioned private image",
    });
    const defaultOptimizerDisposition =
      providerOptimizers.providerOptimizerDisposition;
    const defaultOptimizerEvidence = Object.fromEntries(
      Object.entries(providerOptimizers.nextOptimizer).map(([key, result]) => [
        key,
        { ...result, disposition: defaultOptimizerDisposition },
      ]),
    );
    const vercelNativeOptimizerEvidence = Object.fromEntries(
      Object.entries(providerOptimizers.vercelNativeOptimizer).map(
        ([key, result]) => [
          key,
          { ...result, disposition: defaultOptimizerDisposition },
        ],
      ),
    );

    const disabledOptimizerRaw = {
      noGateBeforeWarm: await requestExactGatedAsset(
        alias,
        privateImagePaths.disabledOptimizerResourcePath,
      ),
      headerGate: await requestExactGatedAsset(
        alias,
        privateImagePaths.disabledOptimizerResourcePath,
        { [STAGING_ACCESS_HEADER]: secret },
      ),
      cookieGate: await requestExactGatedAsset(
        alias,
        privateImagePaths.disabledOptimizerResourcePath,
        { Cookie: `${STAGING_ACCESS_COOKIE}=${secret}` },
      ),
      noGateAfterWarm: await requestExactGatedAsset(
        alias,
        privateImagePaths.disabledOptimizerResourcePath,
      ),
      invalidHeaderAfterWarm: await requestExactGatedAsset(
        alias,
        privateImagePaths.disabledOptimizerResourcePath,
        { [STAGING_ACCESS_HEADER]: "W".repeat(secret.length) },
      ),
      invalidCookieAfterWarm: await requestExactGatedAsset(
        alias,
        privateImagePaths.disabledOptimizerResourcePath,
        { Cookie: `${STAGING_ACCESS_COOKIE}=${"W".repeat(secret.length)}` },
      ),
    };
    if (
      Object.values(disabledOptimizerRaw).some(
        (result) => !isExactDealFlowApplicationGateResponse(result),
      )
    ) {
      throw new Error(
        `${alias.label} configured disabled image path was not the exact DealFlow closure`,
      );
    }
    const disabledOptimizer = Object.fromEntries(
      Object.entries(disabledOptimizerRaw).map(([key, result]) => [
        key,
        {
          ...result,
          disposition: "DEALFLOW_APPLICATION_GATE",
        },
      ]),
    );

    const legacyProviderOptimizers =
      await proveExactProviderOptimizerMatrices({
        alias,
        optimizerPaths: {
          defaultOptimizerResourcePath:
            privateImagePaths.legacyOptimizerResourcePath,
          vercelNativeOptimizerResourcePath:
            privateImagePaths.legacyVercelNativeOptimizerResourcePath,
        },
        secret,
        proofLabel: "retired-source image",
      });
    const legacyOptimizerDisposition =
      legacyProviderOptimizers.providerOptimizerDisposition;
    const legacyOptimizer = Object.fromEntries(
      Object.entries(legacyProviderOptimizers.nextOptimizer).map(([key, result]) => [
        key,
        { ...result, disposition: legacyOptimizerDisposition },
      ]),
    );
    const legacyVercelNativeOptimizer = Object.fromEntries(
      Object.entries(legacyProviderOptimizers.vercelNativeOptimizer).map(
        ([key, result]) => [
          key,
          { ...result, disposition: legacyOptimizerDisposition },
        ],
      ),
    );
    const approvedDirectPublicImages =
      await proveApprovedDirectPublicImageMatrix(alias, aliasIndex + 1, secret);
    const dynamicImageSources =
      await proveDynamicImageSourceMatrix(alias, secret);

    aliases.push({
      label: alias.label,
      host: alias.host,
      vercelAutomationBypassRequired:
        alias.vercelAutomationBypassRequired,
      retiredPublicImageSource,
      privateImageSource,
      approvedDirectPublicImages,
      dynamicImageSources,
      legacyOptimizer,
      legacyVercelNativeOptimizer,
      resources: [
        { kind: "real_next_chunk", ...chunk },
        {
          kind: "exact_default_next_image_optimizer_rejection",
          matrixDisposition: defaultOptimizerDisposition,
          ...defaultOptimizerEvidence,
        },
        {
          kind: "exact_vercel_native_image_optimizer_rejection",
          matrixDisposition: defaultOptimizerDisposition,
          ...vercelNativeOptimizerEvidence,
        },
        { kind: "closed_disabled_staging_image_optimizer", ...disabledOptimizer },
      ],
    });
  }
  return Object.freeze({
    status: "PASS",
    aliasCount: aliases.length,
    resourceKinds: [
      "versioned_private_image_source_v2",
      "approved_direct_public_image_portfolio",
      "dynamic_open_graph_image_source",
      "signed_provider_media_image_source",
      "retired_public_image_source_closed",
      "real_next_chunk",
      "exact_default_next_image_optimizer_rejection",
      "exact_vercel_native_image_optimizer_rejection",
      "closed_disabled_staging_image_optimizer",
      "exact_retired_source_optimizer_rejection",
    ],
    imageOptimizationMode:
      "staging_unoptimized_disable_static_images_exact_inventory_and_strict_edge_rejection",
    configuredStagingImageOptimizerPath:
      DISABLED_STAGING_IMAGE_OPTIMIZER_PATH,
    providerOwnedImageOptimizerPaths: [
      NEXT_IMAGE_OPTIMIZER_PATH,
      VERCEL_NATIVE_IMAGE_OPTIMIZER_PATH,
    ],
    exactImageOptimizerDispositions: [
      "EXACT_VERCEL_EDGE_IMAGE_OPTIMIZER_REJECTION",
      "DEALFLOW_APPLICATION_GATE",
    ],
    defaultOptimizerNoOrInvalidGateDisposition:
      "ONE_IDENTICAL_EXACT_CLOSED_OPTIMIZER_REJECTION_PER_ALIAS_AND_SOURCE",
    defaultOptimizerValidGateDisposition:
      "ONE_IDENTICAL_EXACT_CLOSED_OPTIMIZER_REJECTION_PER_ALIAS_AND_SOURCE",
    configuredDisabledOptimizerAllGateModesDisposition:
      "DEALFLOW_APPLICATION_GATE",
    currentVersionedProofIntentionalPublicResourceCountPerAlias: 0,
    approvedDirectPublicImageCountPerAlias:
      APPROVED_DIRECT_PUBLIC_IMAGE_ASSETS.length,
    dynamicImageSourceCountPerAlias: 2,
    defaultOptimizerOwnedByVercelEdge: true,
    defaultOptimizerApplicationProxyClaimed: false,
    vercelNativeOptimizerOwnedByVercelEdge: true,
    vercelNativeOptimizerApplicationProxyClaimed: false,
    bothProviderPathsClassifiedIdenticallyPerAliasAndSource: true,
    zeroOptimizerEligibleStaticMediaAssets:
      identity.imageBuildInputProof.optimizerEligibleStaticMediaAssetCount === 0,
    staticImageImportsDisabledInExactStagingBuild: true,
    directSourceNoGateStatus: 404,
    directSourceHeaderGateStatus: 200,
    directSourceCookieGateStatus: 200,
    retiredPublicSourceStatusAllCredentialModes: 404,
    cachedPriorProofPathUsed: false,
    historicalLegacyOptimizerArtifactAcceptedAsCurrentProof: false,
    retiredSourceOptimizerFullSixModeMatrix: true,
    enumeratedDealFlowOptimizerSourcePortfolioClosedForManifestBoundCandidate: true,
    sourceNextConfigPatternsDenyAll: true,
    hostedCompiledStaticMediaNamespaceIsSoleAllowance: true,
    hostedOutputInventoryExhaustivenessClaimed: false,
    exactCandidateEnumeratedImageSourceClosureBoundToHostedBuildIdentity: true,
    optimizedImageReturnedByDefaultOptimizer: false,
    rawOptimizerBodyOrRequestIdPersisted: false,
    hostedExactCandidateEnumeratedImagePortfolioProof,
    privateImageProofVersion: 2,
    privateImageProofReleaseCommitInPath: true,
    postWarmUnauthorizedSourceAndChunkRecheck: true,
    privateImageForbiddenQueryRejected: true,
    exactDeploymentIdentityVerifiedBeforeProof: true,
    aliases,
    resourcePathsPersisted: false,
    secretsPersistedToEvidence: false,
    vercelAutomationBypassSecretPersistedToEvidence: false,
  });
}

async function proveUniqueDeploymentProtectionRedirect(deploymentUrl, deploymentHost) {
  const base = new URL(deploymentUrl);
  if (
    base.protocol !== "https:" ||
    base.hostname !== deploymentHost ||
    base.port !== "" ||
    base.username !== "" ||
    base.password !== "" ||
    base.pathname !== "/" ||
    base.search !== "" ||
    base.hash !== "" ||
    EXPECTED_APP_ALIASES.some(({ host }) => host === base.hostname) ||
    PRODUCTION_OR_SHARED_HOSTS.has(base.hostname)
  ) {
    throw new Error("Unique deployment protection proof received a non-exact origin");
  }
  const endpoint = new URL("/privacy", base);
  const response = await executionFetch(endpoint, {
    headers: {
      Accept: "text/html",
      "User-Agent": "DealFlow-Staging-Acceptance/1.0",
    },
    redirect: "manual",
  }, 15_000);
  await response.arrayBuffer();
  const rawLocation = response.headers.get("location");
  let protectionRedirect;
  try {
    protectionRedirect = classifyExactVercelAutomationProtectionRedirect({
      endpointUrl: endpoint.toString(),
      responseUrl: response.url,
      status: response.status,
      redirected: response.redirected,
      rawLocation,
    });
  } catch {
    throw new Error("Unique deployment did not retain the exact Vercel protection redirect");
  }
  return Object.freeze({
    status: "PASS",
    deploymentHost,
    responseStatus: response.status,
    redirectFollowed: false,
    protectionLocation: protectionRedirect.locationOriginPath,
    protectionLocationQueryShapeExact:
      protectionRedirect.locationQueryShapeExact,
    protectionReturnUrlExact: protectionRedirect.returnUrlExact,
    protectionNonceFormatExact: protectionRedirect.nonceFormatExact,
    stagingAccessCredentialSent: false,
    vercelAutomationBypassCredentialSent: false,
  });
}

async function waitForDeployment(
  url,
  vercelAutomationBypassRequired,
  timeoutMs = 180_000,
) {
  const startedAt = Date.now();
  let lastStatus = 0;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await executionFetch(`${url}/privacy`, {
        headers: withVercelAutomationBypass(
          withStagingAccess({
            Accept: "text/html",
            "User-Agent": "DealFlow-Staging-Acceptance/1.0",
          }),
          vercelAutomationBypassRequired,
        ),
        redirect: "manual",
      }, 15_000);
      lastStatus = response.status;
      await response.arrayBuffer();
      if (classifyStagingHostReadiness({ status: response.status }) === "ready") {
        return {
          status: response.status,
          elapsedMs: Date.now() - startedAt,
          vercelAutomationBypassRequired,
          vercelAutomationBypassSecretPersistedToEvidence: false,
        };
      }
    } catch (error) {
      if (terminationRequested) throw terminationRequest.error;
      if (error instanceof StagingHostRedirectError) throw error;
      lastStatus = 0;
    }
    await abortableDelay(2_000);
  }
  throw new Error(`Staging deployment did not become ready; last status ${lastStatus}`);
}

function exactReleaseIdentityPayload(identity, vercelDryRunSourceProof) {
  return Object.freeze({
    commit: identity.commit,
    tree: identity.tree,
    trackedWorktreeSha256: identity.trackedWorktreeSha256,
    trackedFileCount: identity.trackedFileCount,
    dependencyLockSha256: identity.dependencyLockSha256,
    deployableSourceSha256: identity.deployableSourceSha256,
    deployableManifestSha256: identity.deployableManifestSha256,
    deployableFileCount: identity.deployableFileCount,
    vercelDryRunSourceSha256: vercelDryRunSourceProof.sourceSetSha256,
    vercelDryRunFileCount: vercelDryRunSourceProof.regularFileCount,
  });
}

async function proveHostedBuildReleaseIdentity(
  identity,
  vercelDryRunSourceProof,
  baseUrl,
  expectedHost,
  vercelAutomationBypassRequired,
) {
  const base = new URL(baseUrl);
  if (
    base.protocol !== "https:" ||
    base.hostname !== expectedHost ||
    base.port !== "" ||
    base.username !== "" ||
    base.password !== "" ||
    base.pathname !== "/" ||
    base.search !== "" ||
    base.hash !== "" ||
    PRODUCTION_OR_SHARED_HOSTS.has(base.hostname)
  ) {
    throw new Error("Hosted release identity proof requires an exact isolated HTTPS origin");
  }

  const endpoint = new URL("/api/internal/release-identity", base);
  const response = await executionFetch(endpoint, {
    headers: withVercelAutomationBypass(
      withStagingAccess({
        Authorization: `Bearer ${requiredEnvironment("INTERNAL_SYSTEM_JOBS_SECRET", 32)}`,
        Accept: "application/json",
        "User-Agent": "DealFlow-Staging-Release-Identity/1.0",
      }),
      vercelAutomationBypassRequired,
    ),
    redirect: "manual",
  }, 30_000);
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.toLowerCase().includes("application/json")
    ? await response.json().catch(() => null)
    : null;
  const expectedRelease = exactReleaseIdentityPayload(
    identity,
    vercelDryRunSourceProof,
  );
  if (
    response.status !== 200 ||
    response.redirected ||
    response.url !== endpoint.href ||
    response.headers.has("location") ||
    payload?.ok !== true ||
    payload?.schemaVersion !== HOSTED_RELEASE_IDENTITY_SCHEMA ||
    JSON.stringify(Object.keys(payload ?? {}).sort()) !==
      JSON.stringify(["buildSource", "ok", "release", "schemaVersion"]) ||
    JSON.stringify(Object.keys(payload?.release ?? {}).sort()) !==
      JSON.stringify([
        "commit",
        "dependencyLockSha256",
        "deployableFileCount",
        "deployableManifestSha256",
        "deployableSourceSha256",
        "trackedFileCount",
        "trackedWorktreeSha256",
        "tree",
        "vercelDryRunFileCount",
        "vercelDryRunSourceSha256",
      ]) ||
    JSON.stringify(payload.release) !== JSON.stringify(expectedRelease)
  ) {
    throw new Error("Hosted artifact did not return the exact build-injected release identity");
  }

  let buildArtifact;
  try {
    buildArtifact = assertExactHostedBuildSourceIdentity({
      buildSource: payload.buildSource,
      expectedRelease,
    });
  } catch {
    throw new Error(
      "Hosted artifact did not prove the source portfolio generated inside its build",
    );
  }

  return Object.freeze({
    status: "PASS",
    origin: base.origin,
    endpointPath: endpoint.pathname,
    httpStatus: response.status,
    redirectFollowed: false,
    responseUrlExact: true,
    schemaVersion: payload.schemaVersion,
    release: expectedRelease,
    runtimeGitMetadataTrustedAsArtifactProof: false,
    buildInjectedIdentityMatched: true,
    buildGeneratedSourcePortfolioMatched: true,
    buildGeneratedIdentityEndpointPath: endpoint.pathname,
    buildGeneratedIdentityTransport: "authenticated_release_identity_payload",
    buildSourceEmbeddedInReleaseIdentityResponse: true,
    deployableManifestSha256: identity.deployableManifestSha256,
    deployableSourceSha256: identity.deployableSourceSha256,
    deployableFileCount: identity.deployableFileCount,
    vercelDryRunSourceSha256: vercelDryRunSourceProof.sourceSetSha256,
    vercelDryRunFileCount: vercelDryRunSourceProof.regularFileCount,
    vercelAutomationBypassRequired,
    vercelAutomationBypassSecretPersistedToEvidence: false,
  });
}

async function assertHostedZeroEffects(
  baseUrl,
  vercelAutomationBypassRequired = false,
) {
  const secret = requiredEnvironment("INTERNAL_SYSTEM_JOBS_SECRET", 32);
  const endpoint = new URL("/api/internal/zero-external-effects", baseUrl);
  const response = await executionFetch(endpoint, {
    headers: withVercelAutomationBypass(
      withStagingAccess({
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      }),
      vercelAutomationBypassRequired,
    ),
    redirect: "manual",
  }, 30_000);
  const payload = await response.json().catch(() => null);
  if (
    response.status !== 200 ||
    response.redirected ||
    response.url !== endpoint.href ||
    response.headers.has("location") ||
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
    vercelAutomationBypassRequired,
    vercelAutomationBypassSecretPersistedToEvidence: false,
  };
}

function createStagingAdminClient({ allowDuringTermination = false } = {}) {
  return createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY", 32),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: allowDuringTermination ? cleanupFetch : executionFetch },
    },
  );
}

function createStagingAnonClient(supabaseUrl, anonKey, { allowDuringTermination = false } = {}) {
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: allowDuringTermination ? cleanupFetch : executionFetch },
  });
}

function rememberTransientSecrets(values) {
  failureContext.transientSecrets = [
    ...new Set([
      ...failureContext.transientSecrets,
      ...values.filter((value) => typeof value === "string" && value.length > 0),
    ]),
  ];
}

function decodeBase32Secret(value) {
  const normalized = String(value ?? "").replaceAll(" ", "").replace(/=+$/u, "").toUpperCase();
  if (!/^[A-Z2-7]{16,256}$/u.test(normalized)) {
    throw new Error("Synthetic operator TOTP secret is malformed");
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let accumulator = 0;
  const bytes = [];
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Synthetic operator TOTP secret is malformed");
    accumulator = (accumulator << 5) | index;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >>> bits) & 0xff);
      accumulator &= (1 << bits) - 1;
    }
  }
  if (bytes.length < 10) throw new Error("Synthetic operator TOTP secret is too short");
  return Buffer.from(bytes);
}

function createTotpCode(secret, timestampMs = Date.now()) {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    throw new Error("Synthetic operator TOTP timestamp is invalid");
  }
  const key = decodeBase32Secret(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timestampMs / 30_000)));
  try {
    const digest = createHmac("sha1", key).update(counter).digest();
    try {
      const offset = digest[digest.length - 1] & 0x0f;
      const binary = digest.readUInt32BE(offset) & 0x7fffffff;
      return String(binary % 1_000_000).padStart(6, "0");
    } finally {
      digest.fill(0);
    }
  } finally {
    key.fill(0);
    counter.fill(0);
  }
}

async function installSyntheticPlatformOperatorAuthority(
  admin,
  seed,
  identity,
  migrations,
  vercelProjectId,
) {
  assertExecutionMayContinue();
  const operatorUserId = seed.scenarios?.operator?.userId;
  if (!/^[a-f0-9-]{36}$/iu.test(operatorUserId ?? "")) {
    throw new Error("Synthetic platform operator identity is missing");
  }
  const existing = await admin.auth.admin.getUserById(operatorUserId);
  assertExecutionMayContinue();
  if (
    existing.error ||
    existing.data.user?.id !== operatorUserId ||
    existing.data.user?.email?.trim().toLowerCase() !== EXPECTED_OPERATOR_EMAIL
  ) {
    throw new Error("Synthetic platform operator identity does not match the exact seed");
  }
  const authorityResponse = await admin.rpc("resolve_owner_decision_authority_v1", {
    p_environment: "staging",
    p_capability: SYNTHETIC_PLATFORM_OPERATOR_CAPABILITY,
    p_host_project_id_sha256: sha256(vercelProjectId),
    p_candidate_commit: identity.commit,
    p_candidate_tree: identity.tree,
    p_candidate_digest: identity.trackedWorktreeSha256,
    p_tracked_file_count: identity.trackedFileCount,
    p_dependency_lock_sha256: identity.dependencyLockSha256,
    p_migration_portfolio_sha256: migrations.migrationPortfolioSha256,
    p_migration_count: migrations.migrationCount,
  });
  assertExecutionMayContinue();
  const authority = Array.isArray(authorityResponse.data)
    ? authorityResponse.data[0]
    : authorityResponse.data;
  const selected = Array.isArray(authority?.selected_values)
    ? authority.selected_values[0]
    : null;
  if (
    authorityResponse.error ||
    !authority ||
    authority.authority_mode !== "synthetic_staging" ||
    JSON.stringify(authority.decision_ids) !==
      JSON.stringify([SYNTHETIC_PLATFORM_OPERATOR_DECISION_ID]) ||
    selected?.id !== SYNTHETIC_PLATFORM_OPERATOR_DECISION_ID ||
    selected?.selectedValue?.capabilityGrants?.[SYNTHETIC_PLATFORM_OPERATOR_CAPABILITY] !==
      "APPROVED_ENABLED" ||
    authority.policy?.contractVersion !== "dealflow-platform-operator-v1" ||
    authority.policy?.requiredAssuranceLevel !== "aal2" ||
    authority.policy?.maximumSessionAgeMinutes !== 10 ||
    !/^[a-f0-9]{64}$/u.test(authority.payload_sha256 ?? "") ||
    authority.signature_reference !==
      `ed25519:${authority.authority_id}:${authority.key_id}:${authority.payload_sha256}` ||
    authority.candidate_commit !== identity.commit ||
    authority.candidate_tree !== identity.tree ||
    authority.candidate_digest !== identity.trackedWorktreeSha256 ||
    authority.host_project_id_sha256 !== sha256(vercelProjectId) ||
    Number(authority.migration_count) !== migrations.migrationCount ||
    authority.migration_portfolio_sha256 !== migrations.migrationPortfolioSha256
  ) {
    throw new Error("Exact synthetic staging platform-admin authority is unavailable");
  }
  const expiresAt = new Date(Date.now() + 6 * 60 * 60_000).toISOString();
  const grantResponse = await admin.rpc(
    "install_synthetic_staging_platform_operator_grant_v1",
    {
      p_user_id: operatorUserId,
      p_operator_role: "operator",
      p_expires_at: expiresAt,
      p_candidate_commit: identity.commit,
      p_candidate_tree: identity.tree,
      p_candidate_digest: identity.trackedWorktreeSha256,
      p_authority_packet_digest: authority.payload_sha256,
      p_signed_authority_ref: authority.signature_reference,
    },
  );
  assertExecutionMayContinue();
  if (
    grantResponse.error ||
    !/^[a-f0-9-]{36}$/iu.test(String(grantResponse.data ?? ""))
  ) {
    throw new Error("Synthetic staging platform-operator grant installation failed");
  }
  return Object.freeze({
    status: "PASS",
    environment: "staging",
    authorityMode: "synthetic_staging",
    capability: SYNTHETIC_PLATFORM_OPERATOR_CAPABILITY,
    operatorRole: "operator",
    requiredAssuranceLevel: "aal2",
    maximumSessionAgeMinutes: 10,
    candidateBound: true,
    ownerDecisionAuthorityResolvedExactly: true,
    grantIdentifierValidated: true,
    grantExpiresWithinHours: 6,
    rawUserIdentifierPersisted: false,
    rawGrantIdentifierPersisted: false,
    rawAuthorityReferencePersisted: false,
    productionMutationPerformed: false,
    providerMutationPerformed: false,
    realCustomerDataAccessed: false,
  });
}

function validateSyntheticSessionRoleNames(roleNames) {
  const normalized = [...new Set(roleNames)].sort();
  if (
    normalized.length === 0 ||
    normalized.length !== roleNames.length ||
    normalized.some((role) => !SYNTHETIC_STAGING_ROLE_EMAILS[role])
  ) {
    throw new Error("Synthetic session phase does not contain exact known roles");
  }
  return normalized;
}

async function createSyntheticSessionPortfolio(
  admin,
  seed,
  { phase, roleNames: requestedRoleNames, minimumRequiredLifetimeSeconds },
) {
  assertExecutionMayContinue();
  if (!/^[a-z0-9_]+$/.test(phase ?? "")) {
    throw new Error("Synthetic session phase is invalid");
  }
  if (
    !Number.isSafeInteger(minimumRequiredLifetimeSeconds) ||
    minimumRequiredLifetimeSeconds < 15 * 60
  ) {
    throw new Error("Synthetic session phase requires a safe positive lifetime");
  }
  const roleNames = validateSyntheticSessionRoleNames(requestedRoleNames);
  const supabaseUrl = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY", 32);
  const projectRef = extractProjectRef(supabaseUrl);
  const sessions = {};
  let minimumObservedLifetimeSeconds = Number.POSITIVE_INFINITY;
  let syntheticAal2RoleCount = 0;
  let syntheticTotpEnrollmentCount = 0;
  let staleSyntheticMfaFactorDeletionCount = 0;

  for (const role of roleNames) {
    const email = SYNTHETIC_STAGING_ROLE_EMAILS[role];
    const expectedUserId = seed.scenarios?.[role]?.userId;
    if (!/^[a-f0-9-]{36}$/i.test(expectedUserId ?? "")) {
      throw new Error(`Synthetic session portfolio is missing the seeded ${role} identity`);
    }
    const existing = await admin.auth.admin.getUserById(expectedUserId);
    assertExecutionMayContinue();
    if (
      existing.error ||
      existing.data.user?.id !== expectedUserId ||
      existing.data.user?.email?.trim().toLowerCase() !== email
    ) {
      throw new Error(`Synthetic session portfolio identity mismatch for ${role}`);
    }

    const requiresSyntheticAal2 = phase === "multi_role_browser" && role === "operator";
    if (requiresSyntheticAal2) {
      const factors = await admin.auth.admin.mfa.listFactors({ userId: expectedUserId });
      assertExecutionMayContinue();
      if (factors.error || !Array.isArray(factors.data?.factors)) {
        throw new Error("Unable to inspect exact synthetic operator MFA state");
      }
      for (const factor of factors.data.factors) {
        if (!/^[a-f0-9-]{36}$/iu.test(factor?.id ?? "")) {
          throw new Error("Synthetic operator has a malformed MFA factor identity");
        }
        const deleted = await admin.auth.admin.mfa.deleteFactor({
          userId: expectedUserId,
          id: factor.id,
        });
        assertExecutionMayContinue();
        if (deleted.error || deleted.data?.id !== factor.id) {
          throw new Error("Unable to clear prior synthetic operator MFA factor");
        }
        staleSyntheticMfaFactorDeletionCount += 1;
      }
    }

    const anon = createStagingAnonClient(supabaseUrl, anonKey);
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    assertExecutionMayContinue();
    const tokenHash = link.data.properties?.hashed_token;
    if (link.error || !tokenHash) {
      throw new Error(`Unable to create non-delivering synthetic session for ${role}`);
    }
    const verified = await anon.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    let session = verified.data.session;
    let user = verified.data.user;
    rememberTransientSecrets([
      session?.access_token,
      session?.refresh_token,
    ]);
    let pendingSession = null;
    if (session?.access_token) {
      pendingSession = {
        phase,
        role,
        userId: expectedUserId,
        email,
        accessToken: session.access_token,
        refreshToken: session.refresh_token ?? null,
        accessJwtExpiresAt: Number(session.expires_at),
        mfaFactorId: null,
      };
      failureContext.pendingSyntheticUserGlobalSignOuts.push(pendingSession);
    }
    assertExecutionMayContinue();
    if (
      verified.error ||
      !session?.access_token ||
      !session.refresh_token ||
      user?.id !== expectedUserId ||
      user.email?.trim().toLowerCase() !== email
    ) {
      throw new Error(`Unable to verify exact synthetic session identity for ${role}`);
    }
    if (requiresSyntheticAal2) {
      const enrolled = await anon.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "DealFlow isolated staging operator proof",
        issuer: "DealFlow isolated staging",
      });
      assertExecutionMayContinue();
      const factorId = enrolled.data?.id;
      const totpSecret = enrolled.data?.totp?.secret;
      rememberTransientSecrets([
        factorId,
        totpSecret,
        enrolled.data?.totp?.qr_code,
        enrolled.data?.totp?.uri,
      ]);
      if (
        enrolled.error ||
        !/^[a-f0-9-]{36}$/iu.test(factorId ?? "") ||
        typeof totpSecret !== "string" ||
        !pendingSession
      ) {
        throw new Error("Unable to enroll exact synthetic operator TOTP factor");
      }
      pendingSession.mfaFactorId = factorId;
      const totpCode = createTotpCode(totpSecret);
      rememberTransientSecrets([totpCode]);
      const elevated = await anon.auth.mfa.challengeAndVerify({
        factorId,
        code: totpCode,
      });
      rememberTransientSecrets([
        elevated.data?.access_token,
        elevated.data?.refresh_token,
      ]);
      assertExecutionMayContinue();
      if (
        elevated.error ||
        !elevated.data?.access_token ||
        !elevated.data.refresh_token ||
        elevated.data.user?.id !== expectedUserId
      ) {
        throw new Error("Unable to elevate exact synthetic operator session to AAL2");
      }
      const elevatedSession = await anon.auth.setSession({
        access_token: elevated.data.access_token,
        refresh_token: elevated.data.refresh_token,
      });
      const [assurance, claims] = await Promise.all([
        anon.auth.mfa.getAuthenticatorAssuranceLevel(),
        anon.auth.getClaims(),
      ]);
      assertExecutionMayContinue();
      const claimRecord = claims.data?.claims;
      if (
        elevatedSession.error ||
        !elevatedSession.data.session?.access_token ||
        !elevatedSession.data.session.refresh_token ||
        elevatedSession.data.user?.id !== expectedUserId ||
        assurance.error ||
        assurance.data?.currentLevel !== "aal2" ||
        claims.error ||
        claimRecord?.aal !== "aal2" ||
        claimRecord?.sub !== expectedUserId
      ) {
        throw new Error("Synthetic operator AAL2 session verification failed");
      }
      session = elevatedSession.data.session;
      user = elevatedSession.data.user;
      pendingSession.accessToken = session.access_token;
      pendingSession.refreshToken = session.refresh_token;
      pendingSession.accessJwtExpiresAt = Number(session.expires_at);
      syntheticAal2RoleCount += 1;
      syntheticTotpEnrollmentCount += 1;
    }
    const expiresAt = Number(session.expires_at);
    const remainingLifetimeSeconds = expiresAt - Math.floor(Date.now() / 1000);
    if (
      !Number.isSafeInteger(expiresAt) ||
      remainingLifetimeSeconds < minimumRequiredLifetimeSeconds
    ) {
      throw new Error(`Synthetic session for ${role} does not have a safe proof lifetime`);
    }
    minimumObservedLifetimeSeconds = Math.min(
      minimumObservedLifetimeSeconds,
      remainingLifetimeSeconds,
    );

    const cookieMap = new Map();
    const ssr = createServerClient(supabaseUrl, anonKey, {
      global: { fetch: executionFetch },
      cookieOptions: {
        path: "/",
        sameSite: "none",
        secure: true,
        partitioned: true,
      },
      cookies: {
        getAll() {
          return [...cookieMap].map(([name, value]) => ({ name, value }));
        },
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) {
            if (cookie.options?.maxAge === 0 || cookie.value === "") {
              cookieMap.delete(cookie.name);
            } else {
              cookieMap.set(cookie.name, cookie.value);
            }
          }
        },
      },
    });
    const cookieSession = await ssr.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    assertExecutionMayContinue();
    if (
      cookieSession.error ||
      cookieSession.data.user?.id !== expectedUserId ||
      cookieMap.size === 0 ||
      ![...cookieMap.keys()].every((name) => name.startsWith(`sb-${projectRef}-auth-token`))
    ) {
      throw new Error(`Unable to create exact SSR cookie session for ${role}`);
    }
    const cookies = validateSyntheticBrowserCookieChunks(
      [...cookieMap].map(([name, value]) => ({ name, value })),
      projectRef,
    );
    rememberTransientSecrets(cookies.map((cookie) => cookie.value));
    sessions[role] = {
      userId: expectedUserId,
      email,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt,
      cookies,
    };
  }

  const internalBundle = {
    schemaVersion: SYNTHETIC_SESSION_PORTFOLIO_SCHEMA,
    projectFingerprint: EXPECTED_SUPABASE_FINGERPRINT,
    safeSuffix: EXPECTED_SUPABASE_SAFE_SUFFIX,
    projectRef,
    roles: sessions,
  };
  return {
    phase,
    roleNames,
    internalBundle,
    attestation: {
      status: "PASS",
      schemaVersion: SYNTHETIC_SESSION_PORTFOLIO_SCHEMA,
      phase,
      roleNames,
      roleCount: roleNames.length,
      exactSeedIdentityCount: roleNames.length,
      nonDeliveringAdminMagicLinkCount: roleNames.length,
      portfolioPasswordSignInCount: 0,
      syntheticAal2RoleCount,
      syntheticTotpEnrollmentCount,
      staleSyntheticMfaFactorDeletionCount,
      expectedSyntheticAal2RoleCount: phase === "multi_role_browser" ? 1 : 0,
      syntheticTotpSecretPersisted: false,
      syntheticTotpCodePersisted: false,
      minimumRequiredLifetimeSeconds,
      minimumObservedLifetimeSeconds,
      rawTokenPersisted: false,
      rawCookiePersisted: false,
      accessJwtImmediateRevocationSupported: false,
      accessJwtDispositionAfterGlobalSignOut: "VALID_UNTIL_EXPIRY",
      productionIdentityUsed: false,
    },
  };
}

function providerSessionBundle(portfolio) {
  const roleNames = ["paidDirect", "partnerChild", "partnerChildTwo"];
  if (roleNames.some((role) => !portfolio.internalBundle.roles[role])) {
    throw new Error("Provider proof session phase is incomplete");
  }
  const bundle = {
    schemaVersion: SYNTHETIC_PROVIDER_SESSION_BUNDLE_SCHEMA,
    projectFingerprint: EXPECTED_SUPABASE_FINGERPRINT,
    safeSuffix: EXPECTED_SUPABASE_SAFE_SUFFIX,
    projectRef: portfolio.internalBundle.projectRef,
    roles: Object.fromEntries(roleNames.map((role) => {
      const session = portfolio.internalBundle.roles[role];
      return [role, {
        userId: session.userId,
        email: session.email,
        accessToken: session.accessToken,
        expiresAt: session.expiresAt,
      }];
    })),
  };
  const json = JSON.stringify(bundle);
  const secrets = [
    json,
    ...roleNames.map((role) => portfolio.internalBundle.roles[role].accessToken),
  ];
  rememberTransientSecrets(secrets);
  return { json, secrets };
}

function browserSessionBundle(portfolio) {
  const bundle = {
    schemaVersion: SYNTHETIC_BROWSER_SESSION_BUNDLE_SCHEMA,
    projectFingerprint: EXPECTED_SUPABASE_FINGERPRINT,
    safeSuffix: EXPECTED_SUPABASE_SAFE_SUFFIX,
    projectRef: portfolio.internalBundle.projectRef,
    roles: Object.fromEntries(portfolio.roleNames.map((role) => {
      const session = portfolio.internalBundle.roles[role];
      return [role, {
        userId: session.userId,
        email: session.email,
        expiresAt: session.expiresAt,
        cookies: session.cookies,
      }];
    })),
  };
  const json = JSON.stringify(bundle);
  const secrets = [
    json,
    ...portfolio.roleNames.flatMap((role) =>
      portfolio.internalBundle.roles[role].cookies.map((cookie) => cookie.value),
    ),
  ];
  rememberTransientSecrets(secrets);
  return { json, secrets };
}

function isExactAlreadyInvalidSyntheticSession(error) {
  return (
    [400, 403].includes(error?.status) &&
    /^Auth session missing!?$/i.test(error?.message ?? "")
  );
}

async function removeSyntheticMfaFactorExactly(admin, session) {
  if (!session.mfaFactorId) {
    return {
      required: false,
      removed: true,
      deleteAccepted: false,
      readbackAbsent: true,
      alreadyAbsent: false,
    };
  }

  let deleteAccepted = false;
  try {
    const deleted = await admin.auth.admin.mfa.deleteFactor({
      userId: session.userId,
      id: session.mfaFactorId,
    });
    deleteAccepted =
      !deleted.error && deleted.data?.id === session.mfaFactorId;
  } catch {
    // The authoritative postcondition is the bounded admin readback below.
  }

  let listed;
  try {
    listed = await admin.auth.admin.mfa.listFactors({
      userId: session.userId,
    });
  } catch {
    return {
      required: true,
      removed: false,
      deleteAccepted,
      readbackAbsent: false,
      alreadyAbsent: false,
    };
  }
  const factors = listed.data?.factors;
  const readbackAbsent =
    !listed.error &&
    Array.isArray(factors) &&
    !factors.some((factor) => factor.id === session.mfaFactorId);
  return {
    required: true,
    removed: readbackAbsent,
    deleteAccepted,
    readbackAbsent,
    alreadyAbsent: readbackAbsent && !deleteAccepted,
  };
}

async function revokeSyntheticSessionPhase(
  admin,
  phase,
  { allowDuringTermination = false } = {},
) {
  const target = failureContext.pendingSyntheticUserGlobalSignOuts.filter(
    (session) => session.phase === phase,
  );
  if (target.length === 0) {
    throw new Error(`Synthetic session phase ${phase} has no pending user sign-outs`);
  }
  const cleaned = new Set();
  const refreshRevocationProven = new Set();
  const mfaFactorCleanupProven = new Set();
  const mfaFactorCleanupDeleteAccepted = new Set();
  const mfaFactorCleanupAlreadyAbsent = new Set();
  const globalSignOutAccepted = new Set();
  const globalSignOutAlreadyInvalid = new Set();
  const failures = [];
  const supabaseUrl = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY", 32);
  const revokeOne = async (session) => {
    let mfaCleanup = {
      required: false,
      removed: true,
      deleteAccepted: false,
      readbackAbsent: true,
      alreadyAbsent: false,
    };
    try {
      mfaCleanup = await removeSyntheticMfaFactorExactly(admin, session);
      if (!mfaCleanup.removed) {
        failures.push(
          `${session.role}: synthetic MFA factor cleanup was not proven by readback`,
        );
      } else if (mfaCleanup.required) {
        mfaFactorCleanupProven.add(session);
        if (mfaCleanup.deleteAccepted) {
          mfaFactorCleanupDeleteAccepted.add(session);
        }
        if (mfaCleanup.alreadyAbsent) {
          mfaFactorCleanupAlreadyAbsent.add(session);
        }
      }

      const result = await admin.auth.admin.signOut(session.accessToken, "global");
      if (result.error) {
        if (
          mfaCleanup.required &&
          mfaCleanup.removed &&
          isExactAlreadyInvalidSyntheticSession(result.error)
        ) {
          globalSignOutAlreadyInvalid.add(session);
        } else {
          failures.push(`${session.role}: synthetic global sign-out was not accepted`);
        }
      } else {
        globalSignOutAccepted.add(session);
      }

      if (!session.refreshToken) {
        if (
          (globalSignOutAccepted.has(session) || globalSignOutAlreadyInvalid.has(session)) &&
          mfaCleanup.removed
        ) {
          cleaned.add(session);
          refreshRevocationProven.add(session);
        }
        return;
      }
      {
        const refreshProbe = createStagingAnonClient(supabaseUrl, anonKey, {
          allowDuringTermination,
        });
        const refreshed = await refreshProbe.auth.refreshSession({
          refresh_token: session.refreshToken,
        });
        rememberTransientSecrets([
          refreshed.data.session?.access_token,
          refreshed.data.session?.refresh_token,
        ]);
        const invalidRefreshAuthorityProven =
          refreshed.error?.status === 400 &&
          (
            ["refresh_token_not_found", "refresh_token_already_used"].includes(
              refreshed.error.code ?? "",
            ) ||
            /^Invalid Refresh Token: Refresh Token (?:Not Found|Already Used)$/i.test(
              refreshed.error.message ?? "",
            )
          ) &&
          !refreshed.data.session;
        if (invalidRefreshAuthorityProven) {
          refreshRevocationProven.add(session);
          if (
            (globalSignOutAccepted.has(session) || globalSignOutAlreadyInvalid.has(session)) &&
            mfaCleanup.removed
          ) {
            cleaned.add(session);
          }
        } else if (refreshed.error || !refreshed.data.session) {
          failures.push(
            `${session.role}: refresh-token invalidation could not be distinguished from provider or transport failure`,
          );
        } else {
          const containment = await admin.auth.admin.signOut(
            refreshed.data.session.access_token,
            "global",
          );
          if (!containment.error && mfaCleanup.removed) cleaned.add(session);
          failures.push(`${session.role}: refresh token remained usable after global sign-out`);
        }
      }
    } catch (error) {
      failures.push(
        `${session.role}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  if (allowDuringTermination) {
    await Promise.all(target.map((session) => revokeOne(session)));
  } else {
    for (const session of target) {
      await revokeOne(session);
      assertExecutionMayContinue();
    }
  }
  failureContext.pendingSyntheticUserGlobalSignOuts =
    failureContext.pendingSyntheticUserGlobalSignOuts.filter(
      (session) => !cleaned.has(session),
    );
  if (failures.length > 0) {
    throw new Error(
      `Synthetic user global sign-out failed for ${phase}: ${failures.join(" | ")}`,
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const latestAccessJwtExpiryUnix = target.reduce(
    (latest, session) => Math.max(latest, session.accessJwtExpiresAt || 0),
    0,
  );
  return {
    phase,
    globalSignOutRequestedUserCount: target.length,
    globalSignOutAcceptedUserCount: globalSignOutAccepted.size,
    globalSignOutAlreadyInvalidAfterMfaRemovalCount:
      globalSignOutAlreadyInvalid.size,
    globalSessionInvalidationProvenUserCount: cleaned.size,
    globalRefreshTokenScope: true,
    pendingGlobalSignOutUserCountAfterCleanup:
      failureContext.pendingSyntheticUserGlobalSignOuts.length,
    refreshTokenInvalidationProbeCount: refreshRevocationProven.size,
    allSyntheticUserRefreshTokensRevoked:
      refreshRevocationProven.size === target.length,
    syntheticMfaFactorCleanupRequiredCount:
      target.filter((session) => Boolean(session.mfaFactorId)).length,
    syntheticMfaFactorCleanupAcceptedCount: mfaFactorCleanupProven.size,
    syntheticMfaFactorDeleteAcceptedCount:
      mfaFactorCleanupDeleteAccepted.size,
    syntheticMfaFactorAlreadyAbsentReadbackCount:
      mfaFactorCleanupAlreadyAbsent.size,
    syntheticMfaFactorReadbackRequired:
      target.some((session) => Boolean(session.mfaFactorId)),
    allSyntheticMfaFactorsRemoved:
      mfaFactorCleanupProven.size ===
        target.filter((session) => Boolean(session.mfaFactorId)).length,
    rawMfaFactorIdentifiersPersistedToEvidence: false,
    accessJwtImmediateRevocationSupported: false,
    accessJwtDisposition: "VALID_UNTIL_EXPIRY",
    latestAccessJwtExpiryUnix,
    maxResidualAccessJwtLifetimeSeconds: Math.max(0, latestAccessJwtExpiryUnix - now),
    rawSessionSecretsPersistedToEvidence: false,
    productionIdentityAffected: false,
  };
}

async function revokeAllPendingSyntheticUserRefreshSessions(admin) {
  const phases = [
    ...new Set(
      failureContext.pendingSyntheticUserGlobalSignOuts.map((session) => session.phase),
    ),
  ].sort();
  const results = [];
  const failures = [];
  for (const phase of phases) {
    try {
      results.push(await revokeSyntheticSessionPhase(admin, phase, {
        allowDuringTermination: true,
      }));
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (
    failures.length > 0 ||
    failureContext.pendingSyntheticUserGlobalSignOuts.length !== 0
  ) {
    throw new Error(
      `Synthetic refresh-session emergency cleanup remained incomplete: ${failures.join(" | ")}`,
    );
  }
  return {
    status: "PASS",
    phaseResults: results,
    pendingGlobalSignOutUserCountAfterCleanup: 0,
    allSyntheticUserRefreshTokensRevoked: true,
    accessJwtImmediateRevocationSupported: false,
    accessJwtDisposition: "VALID_UNTIL_EXPIRY",
    productionIdentityAffected: false,
  };
}

async function waitForLateBrowserAuthRequestsToSettle(delayMs = 35_000) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
  return delayMs;
}

async function finalSyntheticUserGlobalSignOutSweep(admin, affectedSessions) {
  const users = [...new Map(
    affectedSessions.map((session) => [session.role, {
      role: session.role,
      userId: session.userId,
      email: session.email,
    }]),
  ).values()].sort((left, right) => left.role.localeCompare(right.role));
  const supabaseUrl = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY", 32);
  const failures = [];
  const results = await Promise.all(users.map(async (user) => {
    try {
      const existing = await admin.auth.admin.getUserById(user.userId);
      if (
        existing.error ||
        existing.data.user?.id !== user.userId ||
        existing.data.user?.email?.trim().toLowerCase() !== user.email
      ) {
        throw new Error("synthetic identity no longer matches");
      }
      const link = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: user.email,
      });
      const tokenHash = link.data.properties?.hashed_token;
      if (link.error || !tokenHash) {
        throw new Error("non-delivering containment link was not created");
      }
      const anon = createStagingAnonClient(supabaseUrl, anonKey, {
        allowDuringTermination: true,
      });
      const verified = await anon.auth.verifyOtp({
        type: "magiclink",
        token_hash: tokenHash,
      });
      const session = verified.data.session;
      rememberTransientSecrets([
        session?.access_token,
        session?.refresh_token,
      ]);
      if (
        verified.error ||
        !session?.access_token ||
        !session.refresh_token ||
        verified.data.user?.id !== user.userId
      ) {
        throw new Error("containment session was not established");
      }
      const signOut = await admin.auth.admin.signOut(session.access_token, "global");
      if (signOut.error) {
        throw new Error(`final global sign-out failed: ${signOut.error.message}`);
      }
      const probe = createStagingAnonClient(supabaseUrl, anonKey, {
        allowDuringTermination: true,
      });
      const refreshed = await probe.auth.refreshSession({
        refresh_token: session.refresh_token,
      });
      rememberTransientSecrets([
        refreshed.data.session?.access_token,
        refreshed.data.session?.refresh_token,
      ]);
      const invalidated =
        refreshed.error?.status === 400 &&
        (["refresh_token_not_found", "refresh_token_already_used"].includes(
          refreshed.error.code ?? "",
        ) ||
          /^Invalid Refresh Token: Refresh Token (?:Not Found|Already Used)$/i.test(
            refreshed.error.message ?? "",
          )) &&
        !refreshed.data.session;
      if (!invalidated) {
        if (refreshed.data.session?.access_token) {
          await admin.auth.admin.signOut(
            refreshed.data.session.access_token,
            "global",
          );
        }
        throw new Error("final refresh-token invalidation probe did not pass");
      }
      return { role: user.role, status: "PASS" };
    } catch (error) {
      failures.push(
        `${user.role}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { role: user.role, status: "FAILED" };
    }
  }));
  if (failures.length > 0) {
    throw new Error(`Final synthetic user containment sweep failed: ${failures.join(" | ")}`);
  }
  const roles = new Set(users.map((user) => user.role));
  failureContext.pendingSyntheticUserGlobalSignOuts =
    failureContext.pendingSyntheticUserGlobalSignOuts.filter(
      (session) => !roles.has(session.role),
    );
  return {
    status: "PASS",
    affectedSyntheticUserCount: users.length,
    finalGlobalSignOutAcceptedUserCount: results.length,
    finalRefreshInvalidationProbeCount: results.length,
    allRefreshTokensIssuedBeforeFinalSweepRevoked: true,
    unboundedFutureRemoteIssuanceClaimed: false,
    rawSessionSecretsPersistedToEvidence: false,
    productionIdentityAffected: false,
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

async function resetIsolatedStagingRateLimits(admin, phase) {
  const before = await admin
    .from("rate_limit_buckets")
    .select("bucket_key", { count: "exact", head: true });
  assertExecutionMayContinue();
  if (before.error || typeof before.count !== "number") {
    throw new Error(`Unable to enumerate isolated staging rate limits during ${phase}`);
  }
  assertExecutionMayContinue();
  const deleted = await admin
    .from("rate_limit_buckets")
    .delete()
    .not("bucket_key", "is", null);
  assertExecutionMayContinue();
  if (deleted.error) {
    throw new Error(`Unable to reset isolated staging rate limits during ${phase}`);
  }
  const after = await admin
    .from("rate_limit_buckets")
    .select("bucket_key", { count: "exact", head: true });
  if (after.error || after.count !== 0) {
    throw new Error(`Isolated staging rate limits did not reset to exact zero during ${phase}`);
  }
  return {
    phase,
    rowsBefore: before.count,
    rowsAfter: 0,
    exactIsolatedProjectOnly: true,
    productionDataChanged: false,
  };
}

async function captureRlsFixtureResidue(admin) {
  const count = async (name, query) => {
    const result = await query;
    if (result.error || typeof result.count !== "number") {
      throw new Error(`Unable to verify RLS fixture cleanup for ${name}`);
    }
    return result.count;
  };
  const counts = {};
  for (const marker of [
    ...RLS_FIXTURE_DIRECT_MARKERS,
    ...RLS_FIXTURE_LEGACY_IMMUTABLE_MARKERS,
  ]) {
    counts[marker.key] = await count(
      marker.key,
      applyRlsFixtureMarker(
        admin
          .from(marker.table)
          .select(marker.column, { count: "exact", head: true }),
        marker,
      ),
    );
  }

  let authFixtureCount = 0;
  for (let page = 1; ; page += 1) {
    const authData = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (authData.error) throw new Error(`Unable to verify RLS auth fixture cleanup page ${page}`);
    authFixtureCount += authData.data.users.filter((user) =>
      isRlsFixtureAuthEmail(user.email),
    ).length;
    if (authData.data.users.length < 200) break;
  }
  counts.authUsers = authFixtureCount;

  const organizationMarker = RLS_FIXTURE_DIRECT_MARKERS.find(
    (marker) => marker.key === "organizations",
  );
  const markerOrganizations = await applyRlsFixtureMarker(
    admin.from("organizations").select("id"),
    organizationMarker,
  );
  if (markerOrganizations.error) {
    throw new Error("Unable to enumerate RLS fixture organizations for membership cleanup proof");
  }
  const markerOrganizationIds = (markerOrganizations.data ?? []).map((row) => row.id);
  counts.organizationMemberships = markerOrganizationIds.length === 0
    ? 0
    : await count(
      "organization memberships",
      admin
        .from("organization_memberships")
        .select("organization_id", { count: "exact", head: true })
        .in("organization_id", markerOrganizationIds),
    );
  return {
    counts,
    exactZeroResidue: Object.values(counts).every((count) => count === 0),
  };
}

function countPlaywrightOutcomes(value) {
  const counts = {
    tests: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    interrupted: 0,
    projectCounts: {},
  };
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (Array.isArray(node.tests)) {
      for (const testCase of node.tests) {
        counts.tests += 1;
        const projectName = typeof testCase.projectName === "string"
          ? testCase.projectName
          : "__missing_project__";
        counts.projectCounts[projectName] = (counts.projectCounts[projectName] ?? 0) + 1;
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
  counts.projectCounts = Object.fromEntries(
    Object.entries(counts.projectCounts).sort(([left], [right]) =>
      left.localeCompare(right)
    ),
  );
  return counts;
}

function registerUnsealedPlaywrightArtifactDirectories(evidenceDir, paths) {
  assertExecutionMayContinue();
  const exactRoot = resolve(evidenceDir);
  for (const path of paths) {
    const exactPath = resolve(path);
    const relativePath = relative(exactRoot, exactPath);
    if (
      !relativePath ||
      relativePath === ".." ||
      relativePath.startsWith(`..${sep}`) ||
      resolve(exactRoot, relativePath) !== exactPath
    ) {
      throw new Error("Playwright artifact directory must be a strict evidence child");
    }
    if (!failureContext.unsealedPlaywrightArtifactDirectories.includes(exactPath)) {
      failureContext.unsealedPlaywrightArtifactDirectories.push(exactPath);
    }
  }
}

function deleteAllRegisteredUnsealedPlaywrightArtifacts() {
  const evidenceDir = failureContext.evidenceDir;
  const registered = [...failureContext.unsealedPlaywrightArtifactDirectories];
  if (!evidenceDir) {
    if (registered.length > 0) {
      throw new Error("Registered Playwright artifacts have no controlling evidence root");
    }
    return {
      status: "PASS",
      policy: UNSEALED_PLAYWRIGHT_FAILURE_POLICY,
      registeredDirectoryCount: 0,
      deletedDirectoryCount: 0,
      remainingDirectoryCount: 0,
      rawReporterArtifactsRetained: false,
    };
  }
  const disposition = deleteRegisteredUnsealedPlaywrightArtifactDirectories({
    evidenceDir,
    registeredDirectories: registered,
  });
  failureContext.unsealedPlaywrightArtifactDirectories = [];
  return disposition;
}

async function runPlaywrightSuite({ name, config, environment, evidenceDir, secrets = [] }) {
  const outputDir = join(evidenceDir, name);
  mkdirSync(outputDir, { mode: 0o700 });
  const binary = join(EXPECTED_REPO, "node_modules", ".bin", "playwright");
  const configuredOutputDir = config === "playwright.safe.config.ts"
    ? environment.SAFE_E2E_OUTPUT_DIR
    : environment.STAGING_ACCEPTANCE_PLAYWRIGHT_OUTPUT_DIR;
  registerUnsealedPlaywrightArtifactDirectories(evidenceDir, [
    outputDir,
    configuredOutputDir,
  ]);
  const protectedSecrets = [
    ...protectedRuntimeValues(),
    ...secrets,
  ];
  const jsonPath = join(
    configuredOutputDir,
    config === "playwright.safe.config.ts" ? "playwright-results.json" : "results.json",
  );
  const junitPath = join(
    configuredOutputDir,
    config === "playwright.safe.config.ts" ? "playwright-results.xml" : "results.xml",
  );
  const htmlPath = join(configuredOutputDir, "report", "index.html");
  const safetyPath = config === "playwright.safe.config.ts"
    ? join(configuredOutputDir, "safe-browser-acceptance-summary.json")
    : null;
  const reporterProfile = config === "playwright.safe.config.ts" ? "safe" : "staging";
  const failureDiagnosticPath = join(
    evidenceDir,
    `${name}-failure-diagnostic.json`,
  );
  const fallbackFileName = `${name}-failure-diagnostic.json`;
  if (!/^[a-z][a-z0-9-]{2,80}-failure-diagnostic\.json$/.test(fallbackFileName)) {
    throw new Error("Playwright failure diagnostic filename is invalid");
  }
  failureContext.playwrightFailureDiagnosticFallback = Object.freeze({
    fileName: fallbackFileName,
    diagnostic: buildMinimalPlaywrightFailureDiagnostic({
      suiteName: name,
      reporterProfile,
      failureKind: "evidence_reset_fallback",
      failureDescriptor: "Playwright reporter evidence required a safe evidence-root reset",
      secrets: protectedSecrets,
    }),
  });
  let execution;
  try {
    execution = await runInterruptibleAllowNonzero(
      binary,
      ["test", `--config=${config}`],
      {
        label: `${name} zero-skip Playwright suite`,
        env: { ...childBaseEnvironment(), ...environment },
        timeoutMs: 30 * 60_000,
        maxBuffer: 256 * 1024 * 1024,
        secrets: protectedSecrets,
      },
    );
  } catch (commandError) {
    const minimalDiagnostic = buildMinimalPlaywrightFailureDiagnostic({
      suiteName: name,
      reporterProfile,
      failureKind: "abnormal_command_termination",
      failureDescriptor: commandError instanceof Error
        ? commandError.message
        : String(commandError),
      secrets: protectedSecrets,
    });
    failureContext.playwrightFailureDiagnosticFallback = Object.freeze({
      fileName: fallbackFileName,
      diagnostic: minimalDiagnostic,
    });
    writeJson(failureDiagnosticPath, minimalDiagnostic, {
      allowDuringTermination: true,
    });
    throw commandError;
  }
  if (execution.status !== 0) {
    failureContext.playwrightFailureDiagnosticFallback = Object.freeze({
      fileName: fallbackFileName,
      diagnostic: buildMinimalPlaywrightFailureDiagnostic({
        suiteName: name,
        reporterProfile,
        failureKind: "evidence_reset_fallback",
        executionStatus: execution.status,
        failureDescriptor: "Detailed Playwright reporter evidence required a safe evidence-root reset",
        secrets: protectedSecrets,
      }),
    });
    let failureDiagnostic;
    try {
      failureDiagnostic = buildPlaywrightFailureDiagnostic({
        suiteName: name,
        reporterProfile,
        executionStatus: execution.status,
        reporterRoot: configuredOutputDir,
        jsonReporterPath: jsonPath,
        junitReporterPath: junitPath,
        htmlReporterPath: htmlPath,
        safetyReporterPath: safetyPath,
        commandDiagnostics: [execution.stderr, execution.stdout],
        secrets: protectedSecrets,
      });
    } catch (diagnosticError) {
      failureDiagnostic = buildMinimalPlaywrightFailureDiagnostic({
        suiteName: name,
        reporterProfile,
        failureKind: "diagnostic_construction_failed",
        executionStatus: execution.status,
        failureDescriptor: diagnosticError instanceof Error
          ? diagnosticError.message
          : String(diagnosticError),
        secrets: protectedSecrets,
      });
      failureContext.playwrightFailureDiagnosticFallback = Object.freeze({
        fileName: fallbackFileName,
        diagnostic: failureDiagnostic,
      });
    }
    writeJson(failureDiagnosticPath, failureDiagnostic, {
      allowDuringTermination: true,
    });
    throw new Error(
      `${name} zero-skip Playwright suite failed with exit ${execution.status}; sanitized reporter diagnostic retained`,
    );
  }
  assertEvidenceSanitized(configuredOutputDir, protectedSecrets);
  for (const artifact of [jsonPath, junitPath, htmlPath]) {
    if (!existsSync(artifact) || !lstatSync(artifact).isFile() || lstatSync(artifact).isSymbolicLink()) {
      throw new Error(`${name} did not produce its complete configured reporter portfolio`);
    }
  }
  const parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
  const counts = countPlaywrightOutcomes(parsed);
  const expectedProjectTestCount = config === "playwright.staging.config.ts"
    ? 15
    : 14;
  const expectedProjectCounts = {
    "desktop-chromium": expectedProjectTestCount,
    "desktop-firefox": expectedProjectTestCount,
    "desktop-webkit": expectedProjectTestCount,
    "mobile-chromium": expectedProjectTestCount,
  };
  if (
    counts.tests !== expectedProjectTestCount * 4 ||
    counts.failed !== 0 ||
    counts.skipped !== 0 ||
    counts.interrupted !== 0 ||
    counts.passed !== counts.tests ||
    JSON.stringify(counts.projectCounts) !== JSON.stringify(expectedProjectCounts)
  ) {
    throw new Error(`${name} did not finish with every browser test passed and zero skipped`);
  }
  let safeAcceptance = null;
  if (config === "playwright.safe.config.ts") {
    if (!existsSync(safetyPath) || !lstatSync(safetyPath).isFile()) {
      throw new Error(`${name} did not produce its authenticated safety reporter summary`);
    }
    safeAcceptance = JSON.parse(readFileSync(safetyPath, "utf8"));
    if (
      safeAcceptance.executionMode !== "hosted_authenticated" ||
      safeAcceptance.playwrightStatus !== "passed" ||
      safeAcceptance.authenticatedStatus !== "passed" ||
      safeAcceptance.authenticatedResultCount !== 16 ||
      safeAcceptance.authenticatedSkippedCount !== 0 ||
      JSON.stringify(safeAcceptance.authenticatedProjectCounts) !==
        JSON.stringify({
          "desktop-chromium": 4,
          "mobile-chromium": 4,
          "desktop-firefox": 4,
          "desktop-webkit": 4,
        })
    ) {
      throw new Error(`${name} custom authenticated safety reporter did not pass exactly`);
    }
  }
  const summary = {
    ...counts,
    configuredJsonReporter: true,
    configuredJunitReporter: true,
    configuredHtmlReporter: true,
    configuredSafetyReporter: config === "playwright.safe.config.ts",
    safeAuthenticatedResultCount: safeAcceptance?.authenticatedResultCount ?? null,
  };
  writeJson(join(outputDir, "validated-reporter-summary.json"), summary);
  failureContext.playwrightFailureDiagnosticFallback = null;
  return summary;
}

function browserVercelAutomationBypassEnvironment(protectionPortfolio) {
  if (
    !Array.isArray(protectionPortfolio) ||
    protectionPortfolio.length === 0 ||
    protectionPortfolio.some((entry) =>
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      JSON.stringify(Object.keys(entry).sort()) !==
        JSON.stringify(["origin", "vercelAutomationBypassRequired"]) ||
      typeof entry.origin !== "string" ||
      typeof entry.vercelAutomationBypassRequired !== "boolean"
    )
  ) {
    throw new Error("Browser Vercel protection portfolio is not exact");
  }
  if (
    !protectionPortfolio.some(
      ({ vercelAutomationBypassRequired }) =>
        vercelAutomationBypassRequired,
    )
  ) {
    return Object.freeze({});
  }
  return Object.freeze({
    VERCEL_AUTOMATION_BYPASS_SECRET: requiredStrongStagingSecret(
      "VERCEL_AUTOMATION_BYPASS_SECRET",
      32,
    ),
  });
}

function multiRoleBrowserEnvironment(
  aliasAccessRequirements,
  evidenceDir,
  browserSessionBundleJson,
) {
  const exactAliasAccess = assertExactAliasRuntimeAccessPortfolio(
    aliasAccessRequirements,
  );
  const protectionPortfolio = exactAliasAccess.map(
    ({ url, vercelAutomationBypassRequired }) => ({
      origin: url,
      vercelAutomationBypassRequired,
    }),
  );
  return {
    CI: "1",
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
    QA_ISOLATED_SUPABASE_PROJECT_REF: process.env.QA_ISOLATED_SUPABASE_PROJECT_REF,
    STAGING_QA_PASSWORD: process.env.STAGING_QA_PASSWORD,
    STAGING_SYNTHETIC_BROWSER_SESSION_BUNDLE: browserSessionBundleJson,
    STAGING_TURNSTILE_TEST_SITE_KEY: STAGING_TURNSTILE_SITE_KEY,
    STAGING_ACCEPTANCE_EXECUTION: "true",
    STAGING_ACCEPTANCE_BASE_URL: exactAliasAccess[0].url,
    STAGING_ACCEPTANCE_PARTNER_BASE_URL: exactAliasAccess[1].url,
    STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL: exactAliasAccess[2].url,
    VERCEL_AUTOMATION_PROTECTION_PORTFOLIO:
      JSON.stringify(protectionPortfolio),
    SAFE_E2E_INTERNAL_SECRET: process.env.INTERNAL_SYSTEM_JOBS_SECRET,
    STAGING_ACCESS_GATE_SECRET: process.env.STAGING_ACCESS_GATE_SECRET,
    ...browserVercelAutomationBypassEnvironment(protectionPortfolio),
    STAGING_ACCEPTANCE_ZERO_EXTERNAL_EFFECTS_ATTESTATION: ZERO_EXTERNAL_EFFECTS_ATTESTATION,
    STAGING_ACCEPTANCE_PLAYWRIGHT_OUTPUT_DIR: join(evidenceDir, "multi-role-browser-artifacts"),
  };
}

function safeProductBrowserEnvironment(
  aliasAccessRequirements,
  evidenceDir,
  browserSessionBundleJson,
) {
  const [stableAliasAccess] = assertExactAliasRuntimeAccessPortfolio(
    aliasAccessRequirements,
  );
  const protectionPortfolio = [{
    origin: stableAliasAccess.url,
    vercelAutomationBypassRequired:
      stableAliasAccess.vercelAutomationBypassRequired,
  }];
  return {
    CI: "1",
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
    QA_AUTH_HARNESS_ENABLED: "true",
    QA_ISOLATED_SUPABASE_PROJECT_REF: process.env.QA_ISOLATED_SUPABASE_PROJECT_REF,
    SAFE_E2E_BASE_URL: stableAliasAccess.url,
    VERCEL_AUTOMATION_PROTECTION_PORTFOLIO:
      JSON.stringify(protectionPortfolio),
    SAFE_E2E_INTERNAL_SECRET: process.env.INTERNAL_SYSTEM_JOBS_SECRET,
    STAGING_ACCESS_GATE_SECRET: process.env.STAGING_ACCESS_GATE_SECRET,
    ...browserVercelAutomationBypassEnvironment(protectionPortfolio),
    SAFE_E2E_OUTPUT_DIR: join(evidenceDir, "safe-product-browser-artifacts"),
    SAFE_E2E_QA_AUTH: "true",
    SAFE_E2E_ZERO_EXTERNAL_EFFECTS_ATTESTATION: ZERO_EXTERNAL_EFFECTS_ATTESTATION,
    STAGING_SYNTHETIC_BROWSER_SESSION_BUNDLE: browserSessionBundleJson,
    STAGING_TURNSTILE_TEST_SITE_KEY: STAGING_TURNSTILE_SITE_KEY,
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

async function timedFetch(
  url,
  init,
  expectedHeaders = {},
  acceptedStatuses = [200],
  vercelAutomationBypassRequired = false,
) {
  const startedAt = performance.now();
  try {
    const endpoint = new URL(url);
    const response = await executionFetch(endpoint, {
      ...init,
      headers: withVercelAutomationBypass(
        withStagingAccess(init.headers ?? {}),
        vercelAutomationBypassRequired,
      ),
      redirect: "manual",
    }, 30_000);
    await response.arrayBuffer();
    const headersMatch = Object.entries(expectedHeaders)
      .every(([name, value]) => response.headers.get(name) === value);
    const responseUrlExact =
      !response.redirected &&
      response.url === endpoint.href &&
      !response.headers.has("location");
    return {
      ok:
        acceptedStatuses.includes(response.status) &&
        headersMatch &&
        responseUrlExact,
      status: response.status,
      durationMs: performance.now() - startedAt,
      headersMatch,
      responseUrlExact,
    };
  } catch (error) {
    if (terminationRequested) throw terminationRequest.error;
    return {
      ok: false,
      status: 0,
      durationMs: performance.now() - startedAt,
      headersMatch: false,
      responseUrlExact: false,
    };
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

async function runHostedLoadProof(baseUrl, vercelAutomationBypassRequired) {
  await assertHostedZeroEffects(baseUrl, vercelAutomationBypassRequired);
  const routePaths = ["/privacy", "/terms", `/f/${PUBLIC_FUNNEL_SLUG}`];
  const routeItems = Array.from({ length: 160 }, (_, index) => routePaths[index % routePaths.length]);
  const routeResults = await runBoundedPool(routeItems, 12, (path) =>
    timedFetch(`${baseUrl}${path}`, {
      headers: { Accept: "text/html", "User-Agent": "DealFlow-Staging-Load/1.0" },
    }, {}, [200], vercelAutomationBypassRequired),
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
      [200],
      vercelAutomationBypassRequired,
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
    vercelAutomationBypassRequired,
    vercelAutomationBypassSecretPersistedToEvidence: false,
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
    /\bbase64-[A-Za-z0-9_-]{24,}/,
    /sb-[a-z0-9-]+-auth-token(?:\.\d+)?[\s\S]{0,160}(?:base64-)?[A-Za-z0-9_-]{24,}/i,
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

function sealEvidenceBundle(
  evidenceDir,
  summary,
  secrets,
  { allowDuringTermination = false } = {},
) {
  if (terminationRequested && !allowDuringTermination) {
    throw new Error("Refused to seal normal evidence after termination was requested");
  }
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
  }, { allowDuringTermination });
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
    Number(options.applySuccessorMigration) +
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
    (options.verifyExistingMigrations || options.applyForwardMigration ||
      options.applySuccessorMigration) !==
      Boolean(options.priorMigrationProofDir)
  ) {
    throw new Error(
      "Read-only resume and exact forward mode require --prior-migration-proof-dir; fresh apply forbids it",
    );
  }
  if (options.applyForwardMigration) {
    throw new Error(
      "The current 125 candidate cannot execute historical forward modes; use fresh apply or read-only exact-existing verification",
    );
  }
  if (options.applySuccessorMigration) {
    throw new Error(
      "The current 125 candidate cannot execute the historical 122-to-123 successor mode; use fresh apply or read-only exact-existing verification",
    );
  }
  approvedStagingEvidenceParent =
    captureApprovedStagingEvidenceParent(options.evidenceDir);

  failureContext.stage = "candidate_preflight";
  const identity = captureExactReleaseIdentity();
  failureContext.identity = identity;
  const migrations = captureMigrationPortfolio();
  const vercelAuthority = captureVercelProjectIdentity();
  const vercelProject = vercelAuthority.evidence;
  const execution = assertFailClosedExecutionEnvironment();
  const stagingProjectRecord = captureExactStagingProjectRecord(
    execution.projectRef,
  );
  const vercel = resolvePinnedVercelCli();
  failureContext.vercelSelection = vercel;
  failureContext.stage = "vercel_dry_run_source_portfolio";
  const vercelDryRunSourceProof =
    await proveExactVercelDryRunSourcePortfolio(vercel);
  const stagingAccessGateSecret = randomBytes(48).toString("base64url");
  process.env.STAGING_ACCESS_GATE_SECRET = stagingAccessGateSecret;
  failureContext.transientSecrets.push(stagingAccessGateSecret);
  const hostedEnvironment = hostedStagingEnvironment(
    execution.projectRef,
    vercelAuthority.projectId,
    identity,
    migrations,
    vercelDryRunSourceProof,
    stagingAccessGateSecret,
  );
  const hostedEnvironmentNames = Object.keys(hostedEnvironment).sort();
  if (hostedEnvironmentNames.length !== 95) {
    throw new Error("The exact 95-variable isolated staging environment portfolio is required");
  }
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
  if (
    roundOne.resolvedCommandPortfolioSha256 !==
    roundTwo.resolvedCommandPortfolioSha256
  ) {
    throw new Error(
      "The two exact final-verification rounds used different resolved command portfolios",
    );
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
    stagingProjectRecord: stagingProjectRecord.evidence,
    stableStagingHost: EXPECTED_STAGING_HOST,
    partnerOneStagingHost: EXPECTED_PARTNER_ONE_HOST,
    partnerTwoStagingHost: EXPECTED_SECOND_PARTNER_HOST,
    directAndPartnerHostsMustBeDistinct: true,
    hostedEnvironmentVariableCount: hostedEnvironmentNames.length,
    hostedEnvironmentNameSetSha256: sha256(hostedEnvironmentNames.join("\n")),
    hostedEnvironmentValuesPersistedToEvidence: false,
    vercelDryRunSourceProof,
    roundOne,
    roundTwo,
    executionFlags: {
      execute: options.execute,
      applyMigrations: options.applyMigrations,
      applyForwardMigration: options.applyForwardMigration,
      applySuccessorMigration: options.applySuccessorMigration,
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
  writeJson(
    join(options.evidenceDir, "vercel-dry-run-source-proof.json"),
    vercelDryRunSourceProof,
  );

  failureContext.stage = "predeploy_closed_alias_surface";
  const preDeployClosedAliasSurface =
    await proveClosedPreDeployAppAliasSurface();
  writeJson(
    join(options.evidenceDir, "predeploy-closed-alias-surface.json"),
    preDeployClosedAliasSurface,
  );

  failureContext.stage = "hosted_environment_configuration";
  const hostedEnvironmentProof = await configureHostedStagingEnvironment(
    hostedEnvironment,
    vercelAuthority.projectId,
    vercelAuthority.organizationId,
  );
  assertExactHostedEnvironmentProof(hostedEnvironmentProof);
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
  } else if (options.applySuccessorMigration) {
    migrationBrokerArgs.push(
      "--apply-successor-exact",
      options.priorMigrationProofDir,
    );
  }
  await runInterruptible(
    EXECUTABLE,
    migrationBrokerArgs,
    {
      label: options.verifyExistingMigrations
        ? "read-only exact existing isolated-staging migration verifier"
        : options.applyForwardMigration
          ? "exact forward-only isolated-staging migration broker"
          : options.applySuccessorMigration
            ? "exact 122-to-123 successor isolated-staging migration broker"
            : "atomic fresh isolated-staging migration broker",
      env: {
        ...childBaseEnvironment(),
        PATH: process.env.PATH,
        DEALFLOW_NATIVE_PGBIN: process.env.DEALFLOW_NATIVE_PGBIN,
        DEALFLOW_STAGING_PROJECT_RECORD: stagingProjectRecord.path,
      },
      timeoutMs: 30 * 60_000,
      secrets: protectedRuntimeValues(),
    },
  );
  const migrationSummary = JSON.parse(
    readFileSync(join(migrationEvidenceDir, "staging-migration-summary.json"), "utf8"),
  );
  const ghlEmbedAuthExchangePreflightCount =
    migrationSummary.ghlEmbedAuthExchangeCountAtVerification;
  if (ghlEmbedAuthExchangePreflightCount !== 0) {
    throw new Error(
      "The read-only migration broker did not prove an empty GHL embed auth-exchange surface",
    );
  }
  let priorApplicationRetainedHistory = false;
  if (
    options.verifyExistingMigrations ||
    options.applyForwardMigration ||
    options.applySuccessorMigration
  ) {
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
    isExactSafeStagingAuthSurfaceProof(
      migrationSummary.authUserSurfaceAtVerification,
    ) &&
    migrationSummary.authUserCountAtVerification ===
      migrationSummary.authUserSurfaceAtVerification.userCount &&
    priorApplicationRetainedHistory &&
    exactCurrentResumePriorIdentity;
  const exactForwardApplication =
    options.applyForwardMigration &&
    migrationSummary.migrationMode === "APPLY_FORWARD_EXACT" &&
    migrationSummary.transition === "EXACT_104_TO_120" &&
    migrationSummary.forwardOnly === true &&
    migrationSummary.priorMigrationCount ===
      FORWARD_104_TO_120_AUTHORITY.prior.migrationCount &&
    migrationSummary.forwardMigrationCount ===
      FORWARD_104_TO_120_AUTHORITY.forwardMigrations.length &&
    JSON.stringify(migrationSummary.forwardMigrations) ===
      JSON.stringify(FORWARD_104_TO_120_AUTHORITY.forwardMigrations) &&
    migrationSummary.terminalVersion === EXPECTED_FINAL_MIGRATION.slice(0, 14) &&
    migrationSummary.migrationPortfolioSha256 ===
      FORWARD_104_TO_120_AUTHORITY.current.migrationPortfolioSha256 &&
    migrationSummary.remoteMutationStarted === true &&
    migrationSummary.remoteMutationCompleted === true &&
    migrationSummary.portfolioApplicationRemoteMutationCompleted === true &&
    migrationSummary.serviceRoleRetentionConfigurationSelectOnly === true &&
    migrationSummary.remoteStateVerificationStatus ===
      "EXACT_FORWARD_104_TO_120_COMMITTED_PORTFOLIO" &&
    priorApplicationRetainedHistory &&
    migrationSummary.priorApplication?.applicationCommit ===
      FORWARD_104_TO_120_AUTHORITY.prior.proofCommit &&
    migrationSummary.priorApplication?.applicationTree ===
      FORWARD_104_TO_120_AUTHORITY.prior.proofTree &&
    migrationSummary.priorApplication?.manifestSha256 ===
      FORWARD_104_TO_120_AUTHORITY.priorEvidence.artifactSha256[
        "evidence-manifest.json"
      ] &&
    migrationSummary.priorApplication?.migrationCount ===
      FORWARD_104_TO_120_AUTHORITY.prior.migrationCount &&
    migrationSummary.priorApplication?.lastCommittedVersion ===
      FORWARD_104_TO_120_AUTHORITY.prior.finalMigration.slice(0, 14) &&
    migrationSummary.priorApplication?.migrationPortfolioSha256 ===
      FORWARD_104_TO_120_AUTHORITY.prior.migrationPortfolioSha256 &&
    migrationSummary.priorApplication?.normalizedSchemaSha256 ===
      FORWARD_104_TO_120_AUTHORITY.prior.normalizedSchemaSha256 &&
    migrationSummary.priorApplication?.structuralCatalogSha256 ===
      FORWARD_104_TO_120_AUTHORITY.prior.structuralCatalogSha256 &&
    migrationSummary.priorApplication?.evidenceKind ===
      "read_only_exact_verification" &&
    migrationSummary.priorApplication?.portfolioApplicationRemoteMutationCompleted === true &&
    migrationSummary.priorApplication?.rawValuesPersisted === false &&
    JSON.stringify(migrationSummary.priorApplication?.authSurface) ===
      JSON.stringify(FORWARD_104_TO_120_AUTHORITY.prior.authSurface);
  const exactSuccessorApplication =
    options.applySuccessorMigration &&
    migrationSummary.migrationMode === "APPLY_SUCCESSOR_EXACT" &&
    migrationSummary.transition === "EXACT_122_TO_123" &&
    migrationSummary.forwardOnly === true &&
    migrationSummary.priorMigrationCount ===
      FORWARD_122_TO_123_AUTHORITY.prior.migrationCount &&
    migrationSummary.forwardMigrationCount === 1 &&
    JSON.stringify(migrationSummary.forwardMigration) === JSON.stringify({
      version: FORWARD_122_TO_123_AUTHORITY.forwardMigration.version,
      file: FORWARD_122_TO_123_AUTHORITY.forwardMigration.file,
      sha256: FORWARD_122_TO_123_AUTHORITY.forwardMigration.sha256,
    }) &&
    migrationSummary.migrationPortfolioSha256 ===
      FORWARD_122_TO_123_AUTHORITY.current.migrationPortfolioSha256 &&
    migrationSummary.remoteMutationStarted === true &&
    migrationSummary.remoteMutationCompleted === true &&
    migrationSummary.portfolioApplicationRemoteMutationCompleted === true &&
    migrationSummary.remoteStateVerificationStatus ===
      "EXACT_FORWARD_122_TO_123_COMMITTED_PORTFOLIO" &&
    priorApplicationRetainedHistory &&
    migrationSummary.priorApplication?.migrationCount ===
      FORWARD_122_TO_123_AUTHORITY.prior.migrationCount &&
    migrationSummary.priorApplication?.migrationPortfolioSha256 ===
      FORWARD_122_TO_123_AUTHORITY.prior.migrationPortfolioSha256 &&
    migrationSummary.priorApplication?.lastCommittedVersion ===
      FORWARD_122_TO_123_AUTHORITY.prior.finalMigration.slice(0, 14) &&
    JSON.stringify(migrationSummary.priorApplication?.migrationFiles) ===
      JSON.stringify(migrations.migrationFiles.slice(
        0,
        FORWARD_122_TO_123_AUTHORITY.prior.migrationCount,
      ));
  if (
    migrationSummary.status !== "PASS" ||
    (!freshAtomicApplication && !verifiedExistingExact && !exactForwardApplication &&
      !exactSuccessorApplication) ||
    migrationSummary.singleOuterTransaction !== true ||
    migrationSummary.migrationHistoryReceiptsInsideOuterTransaction !== true ||
    ![
      "EXACT_COMMITTED_PORTFOLIO",
      "EXACT_EXISTING_COMMITTED_PORTFOLIO",
      "EXACT_FORWARD_104_TO_120_COMMITTED_PORTFOLIO",
      "EXACT_FORWARD_122_TO_123_COMMITTED_PORTFOLIO",
    ].includes(migrationSummary.remoteStateVerificationStatus) ||
    migrationSummary.migrationCount !== EXPECTED_MIGRATION_COUNT ||
    migrationSummary.migrationHistoryCount !== EXPECTED_MIGRATION_COUNT ||
    migrationSummary.lastCommittedVersion !== EXPECTED_FINAL_MIGRATION.slice(0, 14) ||
    migrationSummary.releaseBranch !== identity.branch ||
    migrationSummary.headCommit !== identity.commit ||
    migrationSummary.headTree !== identity.tree ||
    migrationSummary.projectFingerprint !== EXPECTED_SUPABASE_FINGERPRINT ||
    migrationSummary.safeSuffix !== EXPECTED_SUPABASE_SAFE_SUFFIX ||
    migrationSummary.retentionConfigurationRelationOwner !== "postgres" ||
    migrationSummary.retentionConfigurationRowSecurityEnabled !== true ||
    migrationSummary.retentionConfigurationRowSecurityForced !== true ||
    migrationSummary.serviceRoleRetentionConfigurationSelectOnly !== true ||
    JSON.stringify(migrationSummary.serviceRoleTableWritePrivileges) !==
      JSON.stringify({
        insert: false,
        update: false,
        delete: false,
        truncate: false,
        references: false,
        trigger: false,
        maintain: false,
      }) ||
    JSON.stringify(migrationSummary.serviceRoleColumnWritePrivileges) !==
      JSON.stringify({ insert: false, update: false, references: false }) ||
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
  await runInterruptible(
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
        DEALFLOW_STAGING_PROJECT_RECORD: stagingProjectRecord.path,
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
      retentionAuthoritySummary.remoteMutationStarted === true &&
      retentionAuthoritySummary.remoteMutationCompleted === true &&
      retentionAuthoritySummary.remoteMutationOutcome ===
        "exact_authority_projection_refresh_committed");
  const ownerDecisionAuthority = retentionAuthoritySummary.ownerDecisionAuthority;
  const exactOwnerDecisionAuthority =
    [
      "exact_synthetic_owner_grants_installed",
      "exact_synthetic_owner_grants_rotated",
      "exact_synthetic_owner_grants_reused",
    ].includes(ownerDecisionAuthority?.installationMode) &&
    ownerDecisionAuthority.currentGrantCount === 4 &&
    ownerDecisionAuthority.currentCapabilityCount === 4 &&
    Number.isSafeInteger(ownerDecisionAuthority.historicalGrantCount) &&
    ownerDecisionAuthority.historicalGrantCount >= 4 &&
    ownerDecisionAuthority.hostProjectMatches === true &&
    ownerDecisionAuthority.productionGrantCount === 0;
  const privacyAuthority = retentionAuthoritySummary.privacyAuthority;
  const exactPrivacyAuthority =
    [
      "exact_synthetic_privacy_grant_installed",
      "exact_synthetic_privacy_grant_rotated",
      "exact_synthetic_privacy_grant_reused",
    ].includes(privacyAuthority?.installationMode) &&
    privacyAuthority.activeGrantCount === 1 &&
    Number.isSafeInteger(privacyAuthority.historicalGrantCount) &&
    privacyAuthority.historicalGrantCount >= 1 &&
    privacyAuthority.productionGrantCount === 0 &&
    Number.isSafeInteger(privacyAuthority.inventoryRelationCount) &&
    privacyAuthority.inventoryRelationCount > 0 &&
    /^[a-f0-9]{64}$/.test(privacyAuthority.inventoryGenerationDigest ?? "") &&
    /^[a-f0-9]{64}$/.test(privacyAuthority.inventoryClassificationDigest ?? "") &&
    privacyAuthority.unresolvedCount === 0 &&
    privacyAuthority.syntheticClassificationCount ===
      privacyAuthority.inventoryRelationCount &&
    privacyAuthority.nullExecutorCount === 0 &&
    privacyAuthority.wrongGrantCount === 0 &&
    privacyAuthority.wrongSnapshotCount === 0 &&
    privacyAuthority.terminalAuthorityTableCount === 2 &&
    privacyAuthority.legalRetentionAuthorized === false &&
    privacyAuthority.workerAndLegalHoldExecutionAuthorized === false;
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
    JSON.stringify(retentionAuthoritySummary.serviceRolePrivileges) !==
      JSON.stringify({
        select: true,
        insert: false,
        update: false,
        delete: false,
        truncate: false,
        references: false,
        trigger: false,
        maintain: false,
      }) ||
    retentionAuthoritySummary.serviceRoleSelectOnly !== true ||
    retentionAuthoritySummary.serviceRoleColumnWritePrivilegesPresent !== false ||
    retentionAuthoritySummary.anonPrivilegesPresent !== false ||
    retentionAuthoritySummary.authenticatedPrivilegesPresent !== false ||
    retentionAuthoritySummary.publicAclPresent !== false ||
    retentionAuthoritySummary.publicColumnAclPresent !== false ||
    retentionAuthoritySummary.relationOwner !== "postgres" ||
    retentionAuthoritySummary.ownerUpdatePrivilege !== true ||
    retentionAuthoritySummary.exactSyntheticMarker !== true ||
    retentionAuthoritySummary.replaySemantics !==
      "bounded_generation_rotation_or_unexpired_exact_replay_with_catalog_rebind" ||
    !exactOwnerDecisionAuthority ||
    !exactPrivacyAuthority ||
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

  failureContext.stage = "predeployment_alias_authority";
  const preDeployAliasAuthority =
    await proveAuthoritativePreDeployAliasOwnership(vercel);
  writeJson(
    join(options.evidenceDir, "predeploy-alias-authority.json"),
    preDeployAliasAuthority,
  );
  const priorAliasMapping = (aliasHost) => {
    const record = preDeployAliasAuthority.aliases.find(
      ({ host }) => host === aliasHost,
    );
    if (!record) throw new Error("Pre-deployment alias authority record is missing");
    return record.priorMapping;
  };

  failureContext.stage = "predeployment_staging_protection_configuration";
  const preDeploymentProtectionProof = await configureHostedStagingProtection(
    vercel,
    vercelAuthority.projectId,
  );
  failureContext.stage = "immediate_predeployment_source_revalidation";
  const immediatePreDeploymentIdentity = assertExactReleaseIdentityUnchanged(
    identity,
    "Immediate pre-deployment release source",
  );
  const immediatePreDeploymentVercelDryRunSourceProof =
    assertExactVercelDryRunProofUnchanged(
      vercelDryRunSourceProof,
      await proveExactVercelDryRunSourcePortfolio(vercel),
      "Immediate pre-deployment Vercel dry-run source",
    );
  failureContext.stage = "staging_deployment";
  const deployment = await deployExactCommit(identity, vercel);
  writeJson(
    join(options.evidenceDir, "hosted-exact-candidate-image-portfolio.json"),
    deployment.hostedExactCandidateEnumeratedImagePortfolioProof,
  );
  failureContext.stage = "postdeployment_source_revalidation";
  const postDeploymentIdentity = assertExactReleaseIdentityUnchanged(
    identity,
    "Post-deployment release source",
  );
  const sourceRevalidationProof = Object.freeze({
    status: "PASS",
    initialIdentity: identity,
    immediatePreDeploymentIdentity,
    postDeploymentIdentity,
    initialVercelDryRunSourceProof: vercelDryRunSourceProof,
    immediatePreDeploymentVercelDryRunSourceProof,
    exactIdentityBeforeAndAfterUpload: true,
    exactVercelSourcePortfolioRevalidatedImmediatelyBeforeUpload: true,
  });
  writeJson(
    join(options.evidenceDir, "deployment-source-revalidation.json"),
    sourceRevalidationProof,
  );
  failureContext.stage = "postdeployment_staging_protection_verification";
  const postDeploymentProtectionProof = await verifyHostedStagingProtection(
    vercel,
    vercelAuthority.projectId,
  );
  const hostedProtectionProof = Object.freeze({
    status: "PASS",
    configuredBeforeDeployment: true,
    verifiedUnchangedAfterDeployment: true,
    preDeployment: preDeploymentProtectionProof,
    postDeployment: postDeploymentProtectionProof,
  });
  writeJson(join(options.evidenceDir, "staging-protection.json"), hostedProtectionProof);
  failureContext.stage = "unique_deployment_protection_verification";
  const uniqueDeploymentProtection =
    await proveUniqueDeploymentProtectionRedirect(
      deployment.deploymentUrl,
      deployment.deploymentHost,
    );
  failureContext.stage = "stable_alias_configuration";
  const stableAlias = await configureAndProveAppAlias(
    identity,
    deployment,
    vercel,
    {
      aliasLabel: "stable_direct",
      aliasHost: EXPECTED_STAGING_HOST,
      aliasUrl: EXPECTED_STAGING_BASE_URL,
      priorMapping: priorAliasMapping(EXPECTED_STAGING_HOST),
    },
  );
  failureContext.stage = "stable_alias_edge_propagation";
  const stableAliasPropagation =
    await waitForExactAppAliasPropagation(
      EXPECTED_APP_ALIASES[0], options.evidenceDir, vercel, deployment,
    );
  const stableAliasAccess = exactAliasRuntimeAccess(
    EXPECTED_APP_ALIASES[0],
    stableAliasPropagation,
  );
  failureContext.stage = "stable_alias_application_gate_verification";
  const stableGateImmediatelyAfterAlias =
    await proveExactPostDeployAppAliasGate(stableAliasAccess);
  failureContext.stage = "stable_alias_build_identity_verification";
  const stableIdentityImmediatelyAfterAlias =
    await proveHostedBuildReleaseIdentity(
      identity,
      vercelDryRunSourceProof,
      EXPECTED_STAGING_BASE_URL,
      EXPECTED_STAGING_HOST,
      stableAliasAccess.vercelAutomationBypassRequired,
    );
  failureContext.stage = "partner_one_alias_configuration";
  const partnerOneAlias = await configureAndProveAppAlias(
    identity,
    deployment,
    vercel,
    {
      aliasLabel: "partner_one",
      aliasHost: EXPECTED_PARTNER_ONE_HOST,
      aliasUrl: EXPECTED_PARTNER_ONE_BASE_URL,
      priorMapping: priorAliasMapping(EXPECTED_PARTNER_ONE_HOST),
    },
  );
  failureContext.stage = "partner_one_alias_edge_propagation";
  const partnerOneAliasPropagation =
    await waitForExactAppAliasPropagation(
      EXPECTED_APP_ALIASES[1], options.evidenceDir, vercel, deployment,
    );
  const partnerOneAliasAccess = exactAliasRuntimeAccess(
    EXPECTED_APP_ALIASES[1],
    partnerOneAliasPropagation,
  );
  failureContext.stage = "partner_one_application_gate_verification";
  const partnerOneGateImmediatelyAfterAlias =
    await proveExactPostDeployAppAliasGate(partnerOneAliasAccess);
  failureContext.stage = "partner_one_build_identity_verification";
  const partnerOneIdentityImmediatelyAfterAlias =
    await proveHostedBuildReleaseIdentity(
      identity,
      vercelDryRunSourceProof,
      partnerOneAlias.aliasUrl,
      partnerOneAlias.aliasHost,
      partnerOneAliasAccess.vercelAutomationBypassRequired,
    );
  failureContext.stage = "partner_two_alias_configuration";
  const secondPartnerAlias = await configureAndProveAppAlias(
    identity,
    deployment,
    vercel,
    {
      aliasLabel: "partner_two",
      aliasHost: EXPECTED_SECOND_PARTNER_HOST,
      aliasUrl: EXPECTED_SECOND_PARTNER_BASE_URL,
      priorMapping: priorAliasMapping(EXPECTED_SECOND_PARTNER_HOST),
    },
  );
  failureContext.stage = "partner_two_alias_edge_propagation";
  const secondPartnerAliasPropagation =
    await waitForExactAppAliasPropagation(
      EXPECTED_APP_ALIASES[2], options.evidenceDir, vercel, deployment,
    );
  const secondPartnerAliasAccess = exactAliasRuntimeAccess(
    EXPECTED_APP_ALIASES[2],
    secondPartnerAliasPropagation,
  );
  failureContext.stage = "partner_two_application_gate_verification";
  const secondPartnerGateImmediatelyAfterAlias =
    await proveExactPostDeployAppAliasGate(secondPartnerAliasAccess);
  failureContext.stage = "partner_two_build_identity_verification";
  const secondPartnerIdentityImmediatelyAfterAlias =
    await proveHostedBuildReleaseIdentity(
      identity,
      vercelDryRunSourceProof,
      secondPartnerAlias.aliasUrl,
      secondPartnerAlias.aliasHost,
      secondPartnerAliasAccess.vercelAutomationBypassRequired,
    );
  const aliasAccessRequirements = assertExactAliasRuntimeAccessPortfolio([
    stableAliasAccess,
    partnerOneAliasAccess,
    secondPartnerAliasAccess,
  ]);
  failureContext.stage = "stable_alias_readiness";
  const stableReady = await waitForDeployment(
    EXPECTED_STAGING_BASE_URL,
    stableAliasAccess.vercelAutomationBypassRequired,
  );
  failureContext.stage = "partner_one_alias_readiness";
  const partnerOneReady = await waitForDeployment(
    partnerOneAlias.aliasUrl,
    partnerOneAliasAccess.vercelAutomationBypassRequired,
  );
  failureContext.stage = "partner_two_alias_readiness";
  const secondPartnerReady = await waitForDeployment(
    secondPartnerAlias.aliasUrl,
    secondPartnerAliasAccess.vercelAutomationBypassRequired,
  );
  failureContext.stage = "postdeployment_application_alias_gate_verification";
  const postDeployAppAliasGate = await provePostDeployAppAliasGate(
    aliasAccessRequirements,
  );
  writeJson(
    join(options.evidenceDir, "postdeploy-app-alias-gate.json"),
    postDeployAppAliasGate,
  );
  failureContext.stage = "postdeployment_static_asset_gate_verification";
  const postDeployStaticAssetGate = await provePostDeployStaticAssetGate(
    aliasAccessRequirements,
    identity,
    deployment.hostedExactCandidateEnumeratedImagePortfolioProof,
  );
  writeJson(
    join(options.evidenceDir, "postdeploy-static-asset-gate.json"),
    postDeployStaticAssetGate,
  );
  const hostedBuildIdentity = Object.freeze({
    status: "PASS",
    stableAlias: stableIdentityImmediatelyAfterAlias,
    partnerOneAlias: partnerOneIdentityImmediatelyAfterAlias,
    secondPartnerAlias: secondPartnerIdentityImmediatelyAfterAlias,
    allOriginsMatchOneExactBuildIdentity: true,
    runtimeGitMetadataTrustedAsArtifactProof: false,
  });
  writeJson(join(options.evidenceDir, "deployment.json"), {
    ...deployment,
    uniqueDeploymentProtection,
    stableGateImmediatelyAfterAlias,
    stableAliasPropagation,
    stableIdentityImmediatelyAfterAlias,
    stableReady,
    stableAlias,
    partnerOneAlias,
    partnerOneGateImmediatelyAfterAlias,
    partnerOneAliasPropagation,
    partnerOneIdentityImmediatelyAfterAlias,
    partnerOneReady,
    secondPartnerAlias,
    secondPartnerGateImmediatelyAfterAlias,
    secondPartnerAliasPropagation,
    secondPartnerIdentityImmediatelyAfterAlias,
    secondPartnerReady,
    postDeployAppAliasGate,
    postDeployStaticAssetGate,
    hostedBuildIdentity,
    preDeployClosedAliasSurface,
    preDeployAliasAuthority,
    hostedProtectionProof,
    sourceRevalidationProof,
    productionCustomerHost: false,
    isolatedStagingProject: true,
  });

  failureContext.stage = "synthetic_staging_seed";
  const seedOne = await runSeed(
    partnerOneAlias.aliasUrl,
    secondPartnerAlias.aliasUrl,
    ghlEmbedAuthExchangePreflightCount,
  );
  const seedTwo = await runSeed(
    partnerOneAlias.aliasUrl,
    secondPartnerAlias.aliasUrl,
    ghlEmbedAuthExchangePreflightCount,
  );
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

  const admin = createStagingAdminClient();
  failureContext.stage = "synthetic_platform_operator_authority";
  const syntheticPlatformOperatorAuthority =
    await installSyntheticPlatformOperatorAuthority(
      admin,
      seedOne,
      identity,
      migrations,
      vercelAuthority.projectId,
    );
  writeJson(
    join(options.evidenceDir, "synthetic-platform-operator-authority.json"),
    syntheticPlatformOperatorAuthority,
  );

  failureContext.stage = "provider_independent_acceptance";
  const syntheticSessionLifecycle = [];
  const rlsCrossTenantPortfolio = await createSyntheticSessionPortfolio(admin, seedOne, {
    phase: "rls_cross_tenant",
    roleNames: SYNTHETIC_RLS_PROOF_ROLES,
    minimumRequiredLifetimeSeconds: 30 * 60,
  });
  syntheticSessionLifecycle.push(rlsCrossTenantPortfolio.attestation);
  const rlsCrossTenantProof = await runCapturedProofCommand(
    join(dirname(EXECUTABLE), "npm"),
    ["run", "rls:cross-tenant"],
    "authenticated isolated-staging exact cross-tenant proof",
    {
      RLS_USER_A_JWT:
        rlsCrossTenantPortfolio.internalBundle.roles.paidDirect.accessToken,
      RLS_USER_B_JWT:
        rlsCrossTenantPortfolio.internalBundle.roles.attacker.accessToken,
      RLS_ORG_A_ID: PAID_ORGANIZATION_ID,
      RLS_ORG_B_ID: ATTACKER_ORGANIZATION_ID,
    },
  );
  syntheticSessionLifecycle.push(
    await revokeSyntheticSessionPhase(admin, "rls_cross_tenant"),
  );

  const rlsFixturePortfolio = await createSyntheticSessionPortfolio(admin, seedOne, {
    phase: "rls_fixture",
    roleNames: SYNTHETIC_RLS_PROOF_ROLES,
    minimumRequiredLifetimeSeconds: 30 * 60,
  });
  syntheticSessionLifecycle.push(rlsFixturePortfolio.attestation);
  const rlsFixtureProof = await runCapturedProofCommand(
    join(dirname(EXECUTABLE), "npm"),
    ["run", "rls:fixture-smoke"],
    "authenticated isolated-staging RLS fixture and cross-tenant proof",
    {
      RLS_CANONICAL_CREDIT_A_USER_ID: seedOne.rlsCreditFixtures.userAId,
      RLS_CANONICAL_CREDIT_B_USER_ID: seedOne.rlsCreditFixtures.userBId,
      RLS_CANONICAL_CREDIT_A_LEDGER_ID: seedOne.rlsCreditFixtures.ledgerAId,
      RLS_CANONICAL_CREDIT_B_LEDGER_ID: seedOne.rlsCreditFixtures.ledgerBId,
      RLS_CANONICAL_ORGANIZATION_A_ID: seedOne.rlsCreditFixtures.organizationAId,
      RLS_CANONICAL_ORGANIZATION_B_ID: seedOne.rlsCreditFixtures.organizationBId,
      RLS_CANONICAL_BILLING_A_ID: seedOne.rlsCreditFixtures.billingAId,
      RLS_CANONICAL_STRIPE_EVENT_A_ID: seedOne.rlsCreditFixtures.stripeEventAId,
      RLS_CANONICAL_STRIPE_EVENT_B_ID: seedOne.rlsCreditFixtures.stripeEventBId,
      RLS_CANONICAL_PROVIDER_LIMIT_A_ID: seedOne.rlsCreditFixtures.providerUsageLimitAId,
      RLS_CANONICAL_PROVIDER_LIMIT_B_ID: seedOne.rlsCreditFixtures.providerUsageLimitBId,
      RLS_CANONICAL_PROVIDER_EVENT_A_ID: seedOne.rlsCreditFixtures.providerUsageEventAId,
      RLS_CANONICAL_PROVIDER_EVENT_B_ID: seedOne.rlsCreditFixtures.providerUsageEventBId,
      RLS_USER_A_JWT: rlsFixturePortfolio.internalBundle.roles.paidDirect.accessToken,
      RLS_USER_B_JWT: rlsFixturePortfolio.internalBundle.roles.attacker.accessToken,
    },
  );
  const rlsFixtureResidue = await captureRlsFixtureResidue(admin);
  syntheticSessionLifecycle.push(
    await revokeSyntheticSessionPhase(admin, "rls_fixture"),
  );
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
  if (!rlsDeferralsClosed) {
    throw new Error("Authenticated isolated-staging RLS proofs did not close with exact zero residue");
  }

  const zeroEffectsStable = await assertHostedZeroEffects(
    EXPECTED_STAGING_BASE_URL,
    stableAliasAccess.vercelAutomationBypassRequired,
  );
  const zeroEffectsPartner = await assertHostedZeroEffects(
    partnerOneAlias.aliasUrl,
    partnerOneAliasAccess.vercelAutomationBypassRequired,
  );
  const zeroEffectsPartnerTwo = await assertHostedZeroEffects(
    secondPartnerAlias.aliasUrl,
    secondPartnerAliasAccess.vercelAutomationBypassRequired,
  );
  writeJson(join(options.evidenceDir, "hosted-zero-external-effects.json"), {
    status: "PASS",
    stableDirectHost: zeroEffectsStable,
    partnerOneHost: zeroEffectsPartner,
    secondPartnerHost: zeroEffectsPartnerTwo,
  });

  const providerPortfolio = await createSyntheticSessionPortfolio(admin, seedOne, {
    phase: "provider_independent",
    roleNames: SYNTHETIC_PROVIDER_PROOF_ROLES,
    minimumRequiredLifetimeSeconds: 30 * 60,
  });
  const providerBundle = providerSessionBundle(providerPortfolio);
  syntheticSessionLifecycle.push(providerPortfolio.attestation);
  const preJourneyRateLimitReset = await resetIsolatedStagingRateLimits(
    admin,
    "before_provider_independent_journeys",
  );
  const providerIndependentProof = await runProviderIndependentStagingProof(
    EXPECTED_STAGING_BASE_URL,
    providerBundle.json,
    providerBundle.secrets,
    ghlEmbedAuthExchangePreflightCount,
  );
  writeJson(join(options.evidenceDir, "provider-independent-journeys.json"), {
    ...providerIndependentProof,
    containsRealCustomerData: false,
    productionMutationPerformed: false,
    providerMutationPerformed: false,
  });
  const postJourneyRateLimitReset = await resetIsolatedStagingRateLimits(
    admin,
    "after_provider_independent_journeys",
  );
  writeJson(join(options.evidenceDir, "isolated-staging-rate-limit-reset.json"), {
    status: "PASS",
    preJourneyRateLimitReset,
    postJourneyRateLimitReset,
    normalRateLimitImplementationChanged: false,
    productionMutationPerformed: false,
  });
  syntheticSessionLifecycle.push(
    await revokeSyntheticSessionPhase(admin, "provider_independent"),
  );

  const countsBefore = await captureNoEffectCounts(admin);
  const multiRolePortfolio = await createSyntheticSessionPortfolio(admin, seedOne, {
    phase: "multi_role_browser",
    roleNames: SYNTHETIC_MULTI_ROLE_BROWSER_ROLES,
    minimumRequiredLifetimeSeconds: 50 * 60,
  });
  if (
    multiRolePortfolio.attestation.syntheticAal2RoleCount !== 1 ||
    multiRolePortfolio.attestation.syntheticTotpEnrollmentCount !== 1 ||
    multiRolePortfolio.attestation.expectedSyntheticAal2RoleCount !== 1 ||
    multiRolePortfolio.attestation.syntheticTotpSecretPersisted !== false ||
    multiRolePortfolio.attestation.syntheticTotpCodePersisted !== false
  ) {
    throw new Error("Multi-role browser portfolio did not prove one exact synthetic AAL2 operator");
  }
  const multiRoleBundle = browserSessionBundle(multiRolePortfolio);
  syntheticSessionLifecycle.push(multiRolePortfolio.attestation);
  const multiRoleEnvironment = multiRoleBrowserEnvironment(
    aliasAccessRequirements,
    options.evidenceDir,
    multiRoleBundle.json,
  );
  const multiRoleBrowser = await runPlaywrightSuite({
    name: "multi-role-browser",
    config: "playwright.staging.config.ts",
    environment: multiRoleEnvironment,
    evidenceDir: options.evidenceDir,
    secrets: multiRoleBundle.secrets,
  });
  const multiRoleCleanup = await revokeSyntheticSessionPhase(
    admin,
    "multi_role_browser",
  );
  if (
    multiRoleCleanup.syntheticMfaFactorCleanupRequiredCount !== 1 ||
    multiRoleCleanup.syntheticMfaFactorCleanupAcceptedCount !== 1 ||
    multiRoleCleanup.allSyntheticMfaFactorsRemoved !== true ||
    multiRoleCleanup.rawMfaFactorIdentifiersPersistedToEvidence !== false
  ) {
    throw new Error("Synthetic operator MFA factor cleanup was not exactly proven");
  }
  syntheticSessionLifecycle.push(multiRoleCleanup);

  const safePortfolio = await createSyntheticSessionPortfolio(admin, seedOne, {
    phase: "safe_browser",
    roleNames: SYNTHETIC_SAFE_BROWSER_ROLES,
    minimumRequiredLifetimeSeconds: 50 * 60,
  });
  const safeBundle = browserSessionBundle(safePortfolio);
  syntheticSessionLifecycle.push(safePortfolio.attestation);
  const safeBrowserEnvironment = safeProductBrowserEnvironment(
    aliasAccessRequirements,
    options.evidenceDir,
    safeBundle.json,
  );
  const safeProductBrowser = await runPlaywrightSuite({
    name: "safe-product-browser",
    config: "playwright.safe.config.ts",
    environment: safeBrowserEnvironment,
    evidenceDir: options.evidenceDir,
    secrets: safeBundle.secrets,
  });
  syntheticSessionLifecycle.push(
    await revokeSyntheticSessionPhase(admin, "safe_browser"),
  );
  if (failureContext.pendingSyntheticUserGlobalSignOuts.length !== 0) {
    throw new Error(
      "Synthetic session lifecycle did not close with zero pending global sign-outs",
    );
  }
  const sessionCleanupPhases = syntheticSessionLifecycle.filter(
    (entry) => entry.accessJwtDisposition === "VALID_UNTIL_EXPIRY",
  );
  const portfolioAccessJwtMaxResidualLifetimeSeconds = sessionCleanupPhases.reduce(
    (maximum, entry) => Math.max(maximum, entry.maxResidualAccessJwtLifetimeSeconds ?? 0),
    0,
  );
  const portfolioSessionCount = (2 * SYNTHETIC_RLS_PROOF_ROLES.length) +
    SYNTHETIC_PROVIDER_PROOF_ROLES.length +
    SYNTHETIC_MULTI_ROLE_BROWSER_ROLES.length +
    SYNTHETIC_SAFE_BROWSER_ROLES.length;
  const browserProjectCount = 4;
  writeJson(join(options.evidenceDir, "synthetic-session-portfolio-attestation.json"), {
    status: "PASS",
    schemaVersion: SYNTHETIC_SESSION_PORTFOLIO_SCHEMA,
    phaseSpecificJustInTimeSessions: true,
    phases: syntheticSessionLifecycle,
    portfolioSessionCount,
    portfolioPasswordSignInCount: 0,
    browserCredentialPasswordSessionCount: browserProjectCount,
    qaHarnessAdminMagicLinkSessionCount: browserProjectCount,
    totalSyntheticAuthSessionIssuanceCount:
      portfolioSessionCount + (2 * browserProjectCount),
    pendingGlobalSignOutUserCountAfterCleanup: 0,
    refreshTokenReuseAcrossProofPhases: false,
    everySyntheticUserRefreshSessionGloballySignedOutAfterItsPhase: true,
    globalScopeCoveredBrowserCredentialAndHarnessRefreshSessions: true,
    accessJwtImmediateRevocationClaimed: false,
    accessJwtDispositionAfterSignOut: "VALID_UNTIL_EXPIRY",
    portfolioAccessJwtMaxResidualLifetimeSeconds,
    browserAdditionalAccessJwtExpiryPersisted: false,
    exactGlobalResidualAccessJwtLifetimeClaimed: false,
    rawTokenPersisted: false,
    rawCookiePersisted: false,
    productionIdentityUsed: false,
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
    partnerHost: partnerOneAlias.aliasUrl,
    partnerTwoHost: secondPartnerAlias.aliasUrl,
    hostIsolationProven:
      new Set([
        EXPECTED_STAGING_BASE_URL,
        partnerOneAlias.aliasUrl,
        secondPartnerAlias.aliasUrl,
      ]).size === 3,
  });

  const load = await runHostedLoadProof(
    EXPECTED_STAGING_BASE_URL,
    stableAliasAccess.vercelAutomationBypassRequired,
  );
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

  const operatorDebtProof = await runCapturedProofCommand(
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
    exactCandidateAndSchema:
      hostedBuildIdentity.status === "PASS" ? "PASS" : "FAIL",
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
    successorServiceOnlySchemaRlsAndNoEffectReadback: "PASS",
    successorCreditTopUpV2AndPendingStripeProjectionIdempotency: "PASS",
    optimizerMinimumSampleAgainstActiveMetaReceipt:
      "BLOCKED_PROVIDER_INDEPENDENT_ACTIVE_META_RECEIPT_REQUIRED",
    ghlMarketplaceInstallLifecycleAndTokenRotation:
      "BLOCKED_EXTERNAL_GHL_SANDBOX_AUTHORITY",
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
  const stagingVerdict = hostedDeferralsClosed ? "STAGING_GO" : "STAGING_NO_GO";
  const productionReadinessVerdict =
    productionGateBlockers.length === 0 ? "GO" : "NO_GO";
  failureContext.stage = "final_evidence_seal";
  assertPinnedVercelCliUnchanged(vercel);
  writeJson(join(options.evidenceDir, "production-gate-matrix.json"), {
    status: "NO_GO",
    stagingVerdict,
    productionReadinessVerdict,
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
    stagingVerdict,
    productionReadinessVerdict,
    identity,
    migrations,
    deployment,
    hostedBuildIdentity,
    syntheticScenarioCount: 10,
    seedReplayIdempotent: true,
    syntheticRetentionOwnerAuthorityPassed: true,
    syntheticRetentionAuthorityInstallationMode: retentionAuthorityMode,
    syntheticPlatformOperatorAuthorityPassed: true,
    syntheticPlatformOperatorAal2Passed: true,
    hostedZeroExternalEffectsPassed: true,
    preDeployPublicWindowAbsent: true,
    threeAliasApplicationGatePassed: true,
    threeAliasEdgePropagationPassed: true,
    uniqueDeploymentProtectionPassed: true,
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
    ...protectedRuntimeValues(),
  ]);
  failureContext.sealCompleted = true;
  failureContext.unsealedPlaywrightArtifactDirectories = [];
  process.stdout.write(`${JSON.stringify({
    status: summary.status,
    verdict: summary.verdict,
    stagingVerdict: summary.stagingVerdict,
    productionReadinessVerdict: summary.productionReadinessVerdict,
    evidenceDirectory: options.evidenceDir,
    commit: identity.commit,
    tree: identity.tree,
    migrationCount: migrations.migrationCount,
    deploymentId: deployment.deploymentId,
    stableStagingHost: EXPECTED_STAGING_HOST,
    partnerStagingHost: partnerOneAlias.aliasHost,
    partnerTwoStagingHost: secondPartnerAlias.aliasHost,
    seal,
  })}\n`);
}

async function readExactAliasMappingDuringRollback(
  alias,
  label,
  { timeoutMs = EXACT_ALIAS_PROPAGATION_TIMEOUT_MS } = {},
) {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > EXACT_ALIAS_PROPAGATION_TIMEOUT_MS
  ) {
    throw new Error(`${label} authoritative rollback timeout is outside the bounded contract`);
  }
  const startedAt = performance.now();
  const result = await runPinnedVercel(
    failureContext.vercelSelection,
    [
      "api",
      exactAliasRecordPath(alias.host),
      "--raw",
      "--no-color",
    ],
    {
      env: vercelEnvironment(),
      timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      label: `${label} authoritative rollback read`,
      secrets: protectedRuntimeValues(),
    },
    { allowNonzero: true, allowDuringTermination: true },
  );
  const diagnostic = sanitize(
    `${result.stderr ?? ""}\n${result.stdout ?? ""}`,
    protectedRuntimeValues(),
  );
  if (result.status !== 0) {
    if (!/(?:Response Error[^\n]*\b404\b|\b404\b[^\n]*(?:not found|NOT_FOUND))/i.test(diagnostic)) {
      throw new Error(`${label} authoritative rollback read failed: ${diagnostic}`);
    }
    return null;
  }
  const record = parseSingleJsonOutput(
    result.stdout,
    `${label} authoritative rollback alias record`,
  );
  const deploymentId = record.deploymentId ?? null;
  const deploymentHost = record.deployment?.url ?? null;
  if (
    record.alias !== alias.host ||
    typeof record.projectId !== "string" ||
    sha256(record.projectId) !== EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT ||
    !/^dpl_[A-Za-z0-9]+$/.test(deploymentId ?? "") ||
    record.deployment?.id !== deploymentId ||
    typeof deploymentHost !== "string" ||
    !/^[a-z0-9-]+\.vercel\.app$/i.test(deploymentHost) ||
    EXPECTED_APP_ALIASES.some(({ host }) => host === deploymentHost) ||
    PRODUCTION_OR_SHARED_HOSTS.has(deploymentHost)
  ) {
    throw new Error(`${label} did not return the exact isolated staging alias authority`);
  }
  const remainingMs = Math.floor(timeoutMs - (performance.now() - startedAt));
  if (remainingMs < 1) {
    throw new Error(`${label} authoritative rollback read exhausted its bounded timeout`);
  }
  const deploymentResult = await runPinnedVercel(
    failureContext.vercelSelection,
    [
      "api",
      `/v13/deployments/${deploymentId}`,
      "--raw",
      "--no-color",
    ],
    {
      env: vercelEnvironment(),
      timeoutMs: remainingMs,
      maxBuffer: 4 * 1024 * 1024,
      label: `${label} mapped deployment rollback read`,
      secrets: protectedRuntimeValues(),
    },
    { allowDuringTermination: true },
  );
  const authoritative = parseSingleJsonOutput(
    deploymentResult.stdout,
    `${label} mapped deployment rollback record`,
  );
  const authoritativeProjectId =
    authoritative.projectId ?? authoritative.project?.id;
  if (
    authoritative.id !== deploymentId ||
    authoritative.url !== deploymentHost ||
    sha256(String(authoritativeProjectId)) !==
      EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT
  ) {
    throw new Error(`${label} mapped deployment rollback authority did not match`);
  }
  return Object.freeze({
    deploymentId,
    deploymentHost,
    projectIdFingerprint: EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT,
  });
}

class StagingAliasRollbackIncompleteError extends Error {
  constructor(safeRollback) {
    const failedLabels = safeRollback.aliases
      .filter(({ status }) => status !== "PASS")
      .map(({ aliasLabel }) => aliasLabel)
      .join(",");
    super(`Staging alias rollback remained unproven for: ${failedLabels}`);
    this.name = "StagingAliasRollbackIncompleteError";
    this.safeRollback = safeRollback;
  }
}

async function rollbackCreatedStagingAliasesAfterFailure() {
  const mutations = [...failureContext.stagingAliasMutations].reverse();
  if (mutations.length === 0) {
    return Object.freeze({ status: "NOT_REQUIRED", aliasCount: 0, aliases: [] });
  }
  if (!failureContext.vercelSelection) {
    throw new Error("Staging alias rollback authority was not retained");
  }
  const aliases = [];
  for (const mutation of mutations) {
    const result = {
      aliasLabel: mutation.aliasLabel,
      aliasHost: mutation.aliasHost,
      status: "FAILED",
      expectedPriorMappingState: mutation.priorMapping
        ? "EXACT_PRIOR_MAPPING"
        : "ABSENT",
      rollbackCommand: "not_attempted",
      rollbackExitStatus: null,
      authoritativePriorMappingRestored: false,
      authoritativePriorMappingReverifiedAfterEdgeContainment: false,
      publicContainmentDisposition: null,
      publicContainmentClassification: null,
      publicContainmentAttemptCount: 0,
      publicContainmentElapsedMs: null,
      publicContainmentFailurePhase: null,
      staleEdgeObservationCount: 0,
      publiclyContained: false,
      sanitizedFailureSha256: null,
    };
    try {
      const alias = EXPECTED_APP_ALIASES.find(
        ({ host, url }) => host === mutation.aliasHost && url === mutation.aliasUrl,
      );
      if (
        !alias ||
        alias.label !== mutation.aliasLabel ||
        PRODUCTION_OR_SHARED_HOSTS.has(mutation.aliasHost)
      ) {
        throw new Error("Staging alias rollback rejected an unregistered or shared host");
      }
      if (
        mutation.priorMapping !== null &&
        (
          !mutation.priorMapping ||
          typeof mutation.priorMapping !== "object" ||
          !/^dpl_[A-Za-z0-9]+$/.test(mutation.priorMapping.deploymentId ?? "") ||
          !/^[a-z0-9-]+\.vercel\.app$/i.test(
            mutation.priorMapping.deploymentHost ?? "",
          ) ||
          mutation.priorMapping.projectIdFingerprint !==
            EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT ||
          EXPECTED_APP_ALIASES.some(
            ({ host }) => host === mutation.priorMapping.deploymentHost,
          ) ||
          PRODUCTION_OR_SHARED_HOSTS.has(mutation.priorMapping.deploymentHost)
        )
      ) {
        throw new Error("Staging alias rollback rejected an unsafe prior mapping");
      }
      const intendedMapping = Object.freeze({
        deploymentId: mutation.intendedDeploymentId,
        deploymentHost: mutation.intendedDeploymentHost,
        projectIdFingerprint: EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT,
      });
      if (
        !/^dpl_[A-Za-z0-9]+$/.test(intendedMapping.deploymentId ?? "") ||
        !/^[a-z0-9-]+\.vercel\.app$/i.test(intendedMapping.deploymentHost ?? "") ||
        EXPECTED_APP_ALIASES.some(
          ({ host }) => host === intendedMapping.deploymentHost,
        ) ||
        PRODUCTION_OR_SHARED_HOSTS.has(intendedMapping.deploymentHost)
      ) {
        throw new Error("Staging alias rollback rejected an unsafe intended mapping");
      }
      const mappingBeforeRollback = await readExactAliasMappingDuringRollback(
        alias,
        `${mutation.aliasLabel} pre-rollback`,
      );
      if (
        !sameExactAliasMapping(mappingBeforeRollback, mutation.priorMapping) &&
        !sameExactAliasMapping(mappingBeforeRollback, intendedMapping)
      ) {
        throw new Error(`${mutation.aliasLabel} alias drifted outside the registered staging mutation`);
      }

      if (sameExactAliasMapping(mappingBeforeRollback, mutation.priorMapping)) {
        result.rollbackCommand = "none_required";
      } else {
        const args = mutation.priorMapping
          ? [
              "alias",
              "set",
              mutation.priorMapping.deploymentHost,
              mutation.aliasHost,
              "--no-color",
            ]
          : [
              "alias",
              "rm",
              mutation.aliasHost,
              "--yes",
              "--no-color",
            ];
        result.rollbackCommand = mutation.priorMapping
          ? "restore_prior_mapping"
          : "remove_new_mapping";
        const rollback = await runPinnedVercel(
          failureContext.vercelSelection,
          args,
          {
            env: vercelEnvironment(),
            timeoutMs: EXACT_ALIAS_PROPAGATION_TIMEOUT_MS,
            maxBuffer: 4 * 1024 * 1024,
            label: `${mutation.aliasLabel} alias rollback command`,
            secrets: protectedRuntimeValues(),
          },
          { allowDuringTermination: true },
        );
        result.rollbackExitStatus = rollback.status;
      }

      const mappingAfterRollback = await readExactAliasMappingDuringRollback(
        alias,
        `${mutation.aliasLabel} post-rollback`,
      );
      result.authoritativePriorMappingRestored = sameExactAliasMapping(
        mappingAfterRollback,
        mutation.priorMapping,
      );
      if (!result.authoritativePriorMappingRestored) {
        throw new Error(`${mutation.aliasLabel} authoritative prior mapping was not restored`);
      }

      const containment = await waitForExactAliasRollbackContainment({
        priorMappingPresent: mutation.priorMapping !== null,
        probe: ({ timeoutMs }) => requestExactAppAliasEdgeObservation(alias, {
          timeoutMs,
          allowDuringTermination: true,
        }),
        verifyMapping: async ({ timeoutMs }) => {
          const mapping = await readExactAliasMappingDuringRollback(
            alias,
            `${mutation.aliasLabel} post-containment rollback`,
            { timeoutMs },
          );
          if (!sameExactAliasMapping(mapping, mutation.priorMapping)) {
            throw new Error(
              `${mutation.aliasLabel} authoritative prior mapping drifted during edge containment`,
            );
          }
          return Object.freeze({
            exactPriorMappingRestored: true,
            priorMappingPresent: mutation.priorMapping !== null,
            projectIdFingerprint: EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT,
          });
        },
        delay: cleanupDelay,
      });
      const terminalObservation = containment.observations.at(-1);
      result.status = "PASS";
      result.authoritativePriorMappingReverifiedAfterEdgeContainment =
        containment.mappingProof.exactPriorMappingRestored === true;
      result.publicContainmentDisposition = terminalObservation?.disposition ?? null;
      result.publicContainmentClassification = terminalObservation?.classification ?? null;
      result.publicContainmentAttemptCount = containment.observations.length;
      result.publicContainmentElapsedMs = containment.elapsedMs;
      result.staleEdgeObservationCount = containment.observations.filter(
        ({ classification }) => classification.startsWith("WAIT_FOR_"),
      ).length;
      result.publiclyContained = true;
      failureContext.stagingAliasMutations =
        failureContext.stagingAliasMutations.filter(
          (record) => record.aliasHost !== mutation.aliasHost,
        );
    } catch (error) {
      const failure = summarizeExactAliasPropagationFailure(error);
      const lastObservation = failure.observations.at(-1) ?? null;
      result.publicContainmentAttemptCount = failure.requestAttemptCount ?? 0;
      result.publicContainmentElapsedMs = failure.elapsedMs;
      result.publicContainmentFailurePhase = failure.failurePhase;
      result.publicContainmentDisposition =
        failure.terminalObservation?.disposition ??
        lastObservation?.disposition ??
        null;
      result.publicContainmentClassification =
        lastObservation?.classification ?? null;
      result.staleEdgeObservationCount = failure.observations.filter(
        ({ classification }) => classification.startsWith("WAIT_FOR_"),
      ).length;
      result.sanitizedFailureSha256 = sha256(
        sanitize(
          error instanceof Error ? error.message : String(error),
          protectedRuntimeValues(),
        ),
      );
    }
    aliases.push(Object.freeze(result));
  }
  const failedAliasCount = aliases.filter(({ status }) => status !== "PASS").length;
  const rollback = Object.freeze({
    status: failedAliasCount === 0 ? "PASS" : "FAILED",
    aliasCount: aliases.length,
    successfulAliasCount: aliases.length - failedAliasCount,
    failedAliasCount,
    aliases: Object.freeze(aliases),
    allRegisteredAliasesAttempted: aliases.length === mutations.length,
    authoritativePriorMappingsRestored: aliases.every(
      ({ authoritativePriorMappingRestored }) => authoritativePriorMappingRestored,
    ),
    publicContainmentProvenSeparately: aliases.every(
      ({ publiclyContained }) => publiclyContained,
    ),
    cleanupContinuedAfterIndividualFailure: true,
    remainingRegisteredMutationCount: failureContext.stagingAliasMutations.length,
    protectionModeChangedDuringRollback: false,
    productionOrSharedAliasChanged: false,
  });
  if (failedAliasCount > 0) {
    throw new StagingAliasRollbackIncompleteError(rollback);
  }
  return rollback;
}

let terminalFailurePromise = null;

async function finalizeFailure(error, { terminationKind = "main_rejection" } = {}) {
  const pendingBeforeCleanup =
    failureContext.pendingSyntheticUserGlobalSignOuts.length;
  const affectedSyntheticSessions =
    failureContext.pendingSyntheticUserGlobalSignOuts.map((session) => ({
      role: session.role,
      userId: session.userId,
      email: session.email,
    }));
  const registeredReporterDirectoryCount =
    failureContext.unsealedPlaywrightArtifactDirectories.length;
  let aliasRollback = null;
  let aliasRollbackError = null;
  try {
    aliasRollback = await rollbackCreatedStagingAliasesAfterFailure();
  } catch (cleanupError) {
    aliasRollback = cleanupError instanceof StagingAliasRollbackIncompleteError
      ? cleanupError.safeRollback
      : null;
    aliasRollbackError = cleanupError instanceof Error
      ? cleanupError.message
      : String(cleanupError);
  }
  let reporterCleanup = null;
  let reporterCleanupError = null;
  if (!failureContext.sealCompleted && registeredReporterDirectoryCount > 0) {
    try {
      reporterCleanup = deleteAllRegisteredUnsealedPlaywrightArtifacts();
    } catch (cleanupError) {
      reporterCleanupError = cleanupError instanceof Error
        ? cleanupError.message
        : String(cleanupError);
    }
  }
  let emergencyCleanup = null;
  let emergencyCleanupError = null;
  let lateBrowserAuthSettleMs = 0;
  let finalContainmentSweep = null;
  let finalContainmentSweepError = null;
  if (pendingBeforeCleanup > 0) {
    try {
      emergencyCleanup = await revokeAllPendingSyntheticUserRefreshSessions(
        createStagingAdminClient({ allowDuringTermination: true }),
      );
    } catch (cleanupError) {
      emergencyCleanupError = cleanupError instanceof Error
        ? cleanupError.message
        : String(cleanupError);
    }
    if (registeredReporterDirectoryCount > 0) {
      lateBrowserAuthSettleMs = await waitForLateBrowserAuthRequestsToSettle();
      try {
        finalContainmentSweep = await finalSyntheticUserGlobalSignOutSweep(
          createStagingAdminClient({ allowDuringTermination: true }),
          affectedSyntheticSessions,
        );
      } catch (cleanupError) {
        finalContainmentSweepError = cleanupError instanceof Error
          ? cleanupError.message
          : String(cleanupError);
      }
    }
  }
  let sanitizedMessage = sanitize(
    `${error instanceof Error ? error.message : String(error)}${
      emergencyCleanupError ? ` | emergency cleanup: ${emergencyCleanupError}` : ""
    }${
      finalContainmentSweepError
        ? ` | final containment sweep: ${finalContainmentSweepError}`
        : ""
    }${
      reporterCleanupError ? ` | reporter cleanup: ${reporterCleanupError}` : ""
    }${
      aliasRollbackError ? ` | alias rollback: ${aliasRollbackError}` : ""
    }`,
    [...protectedRuntimeValues(), ...failureContext.transientSecrets],
  );
  let failureEvidenceSealError = null;
  try {
    const evidenceDir = failureContext.evidenceDir;
    if (evidenceDir && existsSync(evidenceDir) && !failureContext.sealCompleted) {
      const unsafePartialReasons = [];
      if (reporterCleanupError) {
        unsafePartialReasons.push(`reporter_cleanup:${reporterCleanupError}`);
      }
      const partialSealArtifacts = [
        "FINAL_SUMMARY.json",
        "evidence-manifest.json",
        "SHA256SUMS",
      ].filter((name) => existsSync(join(evidenceDir, name)));
      if (partialSealArtifacts.length > 0) {
        unsafePartialReasons.push(`partial_seal:${partialSealArtifacts.join(",")}`);
      }

      let evidenceSafety;
      if (unsafePartialReasons.length === 0) {
        try {
          enforcePrivateModes(evidenceDir);
          const sanitization = assertEvidenceSanitized(
            evidenceDir,
            protectedRuntimeValues(),
          );
          evidenceSafety = {
            status: "PASS",
            disposition: "RETAINED_SANITIZED_PARTIAL_EVIDENCE",
            sanitization,
            containsSecrets: false,
          };
        } catch (scanError) {
          unsafePartialReasons.push(
            `sanitization:${scanError instanceof Error ? scanError.message : String(scanError)}`,
          );
        }
      }
      if (!evidenceSafety) {
        evidenceSafety = resetEvidenceDirectoryForSafeFailureBundle(
          unsafePartialReasons.join(" | "),
        );
      }
      if (
        evidenceSafety.disposition ===
          "UNSAFE_PARTIAL_EVIDENCE_DESTROYED_AND_ROOT_RECREATED" &&
        failureContext.playwrightFailureDiagnosticFallback
      ) {
        const { fileName, diagnostic } =
          failureContext.playwrightFailureDiagnosticFallback;
        if (!/^[a-z][a-z0-9-]{2,80}-failure-diagnostic\.json$/.test(fileName)) {
          throw new Error("Playwright reset fallback filename is invalid");
        }
        writeJson(join(evidenceDir, fileName), diagnostic, {
          allowDuringTermination: true,
        });
      }

      writeJson(
        join(evidenceDir, "STAGING_ALIAS_FAILURE_ROLLBACK.json"),
        {
          status: aliasRollbackError ? "FAILED" : aliasRollback?.status ?? "NOT_REQUIRED",
          rollback: aliasRollback,
          sanitizedRollbackErrorSha256: aliasRollbackError
            ? sha256(sanitize(aliasRollbackError, protectedRuntimeValues()))
            : null,
          protectionModeChangedDuringRollback: false,
          productionOrSharedAliasChanged: false,
        },
        { allowDuringTermination: true },
      );

      if (pendingBeforeCleanup > 0) {
      writeJson(
        join(evidenceDir, "SYNTHETIC_SESSION_FAILURE_CLEANUP.json"),
        {
          status:
            emergencyCleanupError || finalContainmentSweepError
              ? "FAILED"
              : "PASS",
          pendingGlobalSignOutUserCountBeforeCleanup: pendingBeforeCleanup,
          pendingGlobalSignOutUserCountAfterCleanup:
            failureContext.pendingSyntheticUserGlobalSignOuts.length,
          phaseResults: emergencyCleanup?.phaseResults ?? [],
          lateBrowserAuthSettleMs,
          finalContainmentSweep,
          sanitizedFinalContainmentSweepErrorSha256: finalContainmentSweepError
            ? sha256(sanitize(finalContainmentSweepError, protectedRuntimeValues()))
            : null,
          sanitizedCleanupErrorSha256: emergencyCleanupError
            ? sha256(sanitize(emergencyCleanupError, protectedRuntimeValues()))
            : null,
          allObservedPortfolioRefreshTokensRevoked:
            !emergencyCleanupError &&
            failureContext.pendingSyntheticUserGlobalSignOuts.length === 0,
          allRefreshTokensIssuedBeforeFinalSweepRevoked:
            finalContainmentSweep?.allRefreshTokensIssuedBeforeFinalSweepRevoked ??
            (registeredReporterDirectoryCount === 0 && !emergencyCleanupError),
          unboundedFutureRemoteIssuanceClaimed: false,
          accessJwtImmediateRevocationSupported: false,
          accessJwtDisposition: "VALID_UNTIL_EXPIRY",
          sessionCleanupArtifactContainsSecrets: false,
          rawSessionSecretPersistedByCleanupArtifact: false,
          productionIdentityAffected: false,
        },
        { allowDuringTermination: true },
      );
      }
      if (registeredReporterDirectoryCount > 0) {
      writeJson(
        join(evidenceDir, "UNSEALED_PLAYWRIGHT_FAILURE_CLEANUP.json"),
        {
          status: "PASS",
          terminationKind,
          policy: UNSEALED_PLAYWRIGHT_FAILURE_POLICY,
          registeredDirectoryCount: registeredReporterDirectoryCount,
          deletedDirectoryCount: reporterCleanup?.deletedDirectoryCount ?? null,
          remainingDirectoryCount: 0,
          initialTargetedCleanupStatus: reporterCleanupError ? "FAILED" : "PASS",
          sanitizedCleanupErrorSha256: reporterCleanupError
            ? sha256(sanitize(reporterCleanupError, protectedRuntimeValues()))
            : null,
          evidenceRootResetApplied:
            evidenceSafety.disposition ===
            "UNSAFE_PARTIAL_EVIDENCE_DESTROYED_AND_ROOT_RECREATED",
          rawReporterArtifactsRetained: false,
          cleanupDispositionArtifactContainsSecrets: false,
          retainedReporterSecretStatus: "CLEAN",
        },
        { allowDuringTermination: true },
      );
      }
      writeTerminalFailureArtifact(sanitizedMessage, {
        partialBundleSecretStatus: "CLEAN",
        evidenceSafety,
      });
      const failureSummary = {
        schemaVersion: "dealflow.isolated-staging-acceptance-failure-summary.v1",
        status: "FAILED",
        stagingVerdict: "STAGING_NO_GO",
        productionReadinessVerdict: "NO_GO",
        stage: failureContext.stage || null,
        terminationKind,
        evidenceSafety,
        productionMutationPerformed: false,
        providerMutationPerformed: false,
        advertisingSpendIncurred: false,
        realCommunicationSent: false,
        productionReleaseAuthorized: false,
      };
      const failureSeal = sealEvidenceBundle(
        evidenceDir,
        failureSummary,
        protectedRuntimeValues(),
        { allowDuringTermination: true },
      );
      failureContext.sealCompleted = true;
      failureContext.unsealedPlaywrightArtifactDirectories = [];
      failureContext.playwrightFailureDiagnosticFallback = null;
      process.stderr.write(
        `${JSON.stringify({ status: "FAILED", evidenceDirectory: evidenceDir, seal: failureSeal })}\n`,
      );
    }
  } catch (failureEvidenceError) {
    failureEvidenceSealError = failureEvidenceError instanceof Error
      ? failureEvidenceError.message
      : String(failureEvidenceError);
    sanitizedMessage = sanitize(
      `${sanitizedMessage} | failure evidence seal: ${failureEvidenceSealError}`,
      protectedRuntimeValues(),
    );
  }
  failureContext.transientSecrets = [];
  failureContext.pendingSyntheticUserGlobalSignOuts = [];
  failureContext.playwrightFailureDiagnosticFallback = null;
  try {
    process.stderr.write(`${sanitizedMessage}\n`);
  } catch {
    // Terminal output failure must not bypass cleanup.
  }
}

function finalizeFailureOnce(error, metadata) {
  if (!terminalFailurePromise) {
    terminalFailurePromise = finalizeFailure(error, metadata);
  }
  return terminalFailurePromise;
}

function installCatchableTerminationHandler(signal, exitCode) {
  process.once(signal, () => {
    requestExecutionTermination(new Error(`Caught ${signal}`), {
      terminationKind: `signal_${signal.toLowerCase()}`,
      exitCode,
    });
  });
}

installCatchableTerminationHandler("SIGINT", 130);
installCatchableTerminationHandler("SIGTERM", 143);
installCatchableTerminationHandler("SIGHUP", 129);
process.once("uncaughtException", (error) => {
  requestExecutionTermination(error, {
    terminationKind: "uncaught_exception",
    exitCode: 1,
  });
});
process.once("unhandledRejection", (reason) => {
  requestExecutionTermination(reason, {
    terminationKind: "unhandled_rejection",
    exitCode: 1,
  });
});

async function controlMainExecution() {
  try {
    const mainOutcomePromise = main().then(
      () => ({ type: "success" }),
      (error) => ({ type: "failure", error }),
    );
    const firstOutcome = await Promise.race([
      mainOutcomePromise,
      terminationRequestPromise.then((request) => ({ type: "termination", request })),
    ]);
    if (firstOutcome.type === "success" && !terminationRequest) return;
    if (firstOutcome.type === "failure") {
      requestExecutionTermination(firstOutcome.error, {
        terminationKind: "main_rejection",
        exitCode: 1,
      });
    }

    await drainInterruptibleCommands();
    const finalMainOutcome = firstOutcome.type === "termination"
      ? await mainOutcomePromise
      : firstOutcome;
    await drainInterruptibleCommands();
    const request = terminationRequest ?? requestExecutionTermination(
      finalMainOutcome.error ?? new Error("Staging acceptance terminated"),
      { terminationKind: "main_rejection", exitCode: 1 },
    );
    const failure = request.error ?? finalMainOutcome.error;
    await finalizeFailureOnce(failure, {
      terminationKind: request.terminationKind,
    });
    process.exitCode = request.exitCode;
  } finally {
    if (failureContext.vercelSelection) {
      disposePinnedVercelCli(failureContext.vercelSelection);
      failureContext.vercelSelection = null;
    }
  }
}

void controlMainExecution().catch((error) => {
  process.exitCode = 1;
  try {
    process.stderr.write(
      `${sanitize(error instanceof Error ? error.message : String(error), protectedRuntimeValues())}\n`,
    );
  } catch {
    // The process exit code remains authoritative if even terminal reporting fails.
  }
});
