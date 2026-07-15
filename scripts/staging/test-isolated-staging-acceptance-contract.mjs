#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { isExpectedNavigationAbort } from "../../tests/e2e/expected-navigation-abort.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

for (const value of [
  "net::ERR_ABORTED",
  "NS_BINDING_ABORTED",
  "cancelled",
  "Load cancelled",
  "Request cancelled",
  "Load request cancelled",
]) {
  assert.equal(isExpectedNavigationAbort(value), true, `expected navigation abort: ${value}`);
}
for (const value of [
  "net::ERR_FAILED",
  "net::ERR_BLOCKED_BY_CLIENT",
  "NS_ERROR_NET_TIMEOUT",
  "Request canceled",
  "TLS handshake cancelled",
  "Load request cancelled by policy",
  "unknown request failure",
]) {
  assert.equal(isExpectedNavigationAbort(value), false, `unexpected navigation failure: ${value}`);
}
const runnerPath = join(root, "scripts", "staging", "run-isolated-staging-acceptance.mjs");
const runner = readFileSync(runnerPath, "utf8");
const imageBuildInputContract = readFileSync(
  join(root, "scripts", "staging", "staging-image-build-input-contract.mjs"),
  "utf8",
);
const stagingAccessGateContractTest = readFileSync(
  join(root, "scripts", "staging", "test-isolated-staging-access-gate.mjs"),
  "utf8",
);
const imageOptimizerResponseContract = readFileSync(
  join(root, "scripts", "staging", "staging-image-optimizer-response-contract.mjs"),
  "utf8",
);
const imageOptimizerResponseContractTest = readFileSync(
  join(root, "scripts", "staging", "test-staging-image-optimizer-response-contract.mjs"),
  "utf8",
);
const approvedDirectImageCheckpointContract = readFileSync(
  join(root, "scripts", "staging", "approved-direct-public-image-checkpoint-contract.mjs"),
  "utf8",
);
const approvedDirectImageCheckpointContractTest = readFileSync(
  join(root, "scripts", "staging", "test-approved-direct-public-image-checkpoint-contract.mjs"),
  "utf8",
);
const deployedImageConfigContract = readFileSync(
  join(root, "scripts", "staging", "vercel-deployed-image-config-contract.mjs"),
  "utf8",
);
const deployedImageConfigContractTest = readFileSync(
  join(root, "scripts", "staging", "test-vercel-deployed-image-config-contract.mjs"),
  "utf8",
);
const trustBundle = readFileSync(
  join(root, "config", "security", "supabase-prod-ca-2021.crt"),
);
const priorProofContract = readFileSync(
  join(root, "scripts", "staging", "prior-migration-proof-contract.mjs"),
  "utf8",
);
const seed = readFileSync(join(root, "scripts", "seed-isolated-staging.mjs"), "utf8");
const seedContract = readFileSync(join(root, "scripts", "test-isolated-staging-seed-contract.mjs"), "utf8");
const providerIndependentProof = readFileSync(
  join(root, "scripts", "staging", "run-provider-independent-staging-proof.mjs"),
  "utf8",
);
const vercelProtectionContract = readFileSync(
  join(root, "scripts", "staging", "vercel-staging-protection-contract.mjs"),
  "utf8",
);
const vercelProtectionTest = readFileSync(
  join(root, "scripts", "staging", "test-vercel-staging-protection-contract.mjs"),
  "utf8",
);
const vercelAliasPropagationContract = readFileSync(
  join(root, "scripts", "staging", "vercel-alias-propagation-contract.mjs"),
  "utf8",
);
const vercelAliasPropagationTest = readFileSync(
  join(root, "scripts", "staging", "test-vercel-alias-propagation-contract.mjs"),
  "utf8",
);
const rlsFixtureSmoke = readFileSync(
  join(root, "scripts", "run-rls-fixture-smoke.mjs"),
  "utf8",
);
const rlsCrossTenant = readFileSync(
  join(root, "scripts", "check-rls-cross-tenant.mjs"),
  "utf8",
);
const rlsFixtureContract = readFileSync(
  join(root, "scripts", "lib", "rls-fixture-contract.mjs"),
  "utf8",
);
const browserConfig = readFileSync(join(root, "playwright.staging.config.ts"), "utf8");
const browserSpec = readFileSync(
  join(root, "tests", "e2e", "dealflow-staging-acceptance.spec.ts"),
  "utf8",
);
const safeBrowserSpec = readFileSync(
  join(root, "tests", "e2e", "dealflow-safe.spec.ts"),
  "utf8",
);
for (const [label, source] of [
  ["staging browser", browserSpec],
  ["safe browser", safeBrowserSpec],
]) {
  assert.match(
    source,
    /request\.isNavigationRequest\(\) && isExpectedNavigationAbort\(errorText\)/,
    `${label} may suppress an engine abort only for a navigation request`,
  );
}
const globalSafetyPreflight = readFileSync(
  join(root, "tests", "e2e", "global-safety-preflight.ts"),
  "utf8",
);
const safeBrowserConfig = readFileSync(join(root, "playwright.safe.config.ts"), "utf8");
const browserSessionContract = readFileSync(
  join(root, "scripts", "staging", "browser-session-bundle-contract.mjs"),
  "utf8",
);
const browserContextBoundary = readFileSync(
  join(root, "scripts", "staging", "browser-context-network-boundary.mjs"),
  "utf8",
);
const browserContextBoundaryTest = readFileSync(
  join(root, "scripts", "staging", "test-browser-context-network-boundary.mjs"),
  "utf8",
);
const reporterCleanupContract = readFileSync(
  join(root, "scripts", "staging", "unsealed-playwright-artifact-cleanup.mjs"),
  "utf8",
);
const reporterCleanupTest = readFileSync(
  join(root, "scripts", "staging", "test-unsealed-playwright-artifact-cleanup.mjs"),
  "utf8",
);
const safeBrowserHostContract = readFileSync(
  join(root, "scripts", "staging", "safe-browser-host-contract.mjs"),
  "utf8",
);
const safeBrowserHostTest = readFileSync(
  join(root, "scripts", "staging", "test-safe-browser-host-contract.mjs"),
  "utf8",
);
const interruptibleCommand = readFileSync(
  join(root, "scripts", "staging", "interruptible-command.mjs"),
  "utf8",
);
const interruptibleCommandTest = readFileSync(
  join(root, "scripts", "staging", "test-interruptible-command.mjs"),
  "utf8",
);
const vercelCliSelectionContract = readFileSync(
  join(root, "scripts", "staging", "vercel-cli-selection-contract.mjs"),
  "utf8",
);
const vercelCliSelectionContractTest = readFileSync(
  join(root, "scripts", "staging", "test-vercel-cli-selection-contract.mjs"),
  "utf8",
);
const evidenceRootContract = readFileSync(
  join(root, "scripts", "staging", "staging-evidence-root-contract.mjs"),
  "utf8",
);
const evidenceRootTest = readFileSync(
  join(root, "scripts", "staging", "test-staging-evidence-root-contract.mjs"),
  "utf8",
);
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const envExample = readFileSync(join(root, ".env.example"), "utf8");
const completionSuite = readFileSync(join(root, "scripts", "test-dealflow-completion.mjs"), "utf8");
const zeroEffectsSource = readFileSync(
  join(root, "src", "lib", "safety", "zero-external-effects.ts"),
  "utf8",
);

function extractStringArray(source, name) {
  const body = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\](?: as const)?;`).exec(source)?.[1];
  assert.ok(body, `missing statically inspectable ${name} array`);
  return [...body.matchAll(/"([A-Z0-9_]+)"/g)].map((match) => match[1]).sort();
}

function extractStringObject(source, name) {
  const body = new RegExp(
    `const ${name} = (?:Object\\.freeze\\()?\\{([\\s\\S]*?)\\}\\)?(?: as const)?;`,
  ).exec(source)?.[1];
  assert.ok(body, `missing statically inspectable ${name} object`);
  return Object.fromEntries(
    [...body.matchAll(/([A-Z0-9_]+):\s*"([^"]+)"/g)]
      .map((match) => [match[1], match[2]])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

assert.match(runner, /EXPECTED_REPO = "\/private\/tmp\/dealflow-overnight-release-20260712"/);
assert.match(runner, /EXPECTED_BRANCH = "codex\/dealflow-overnight-release-20260712"/);
assert.match(runner, /EXPECTED_STAGING_HOST = "dealflow-os-rebuild-selfserve-clean\.vercel\.app"/);
assert.match(runner, /EXPECTED_SUPABASE_SAFE_SUFFIX = "qibh"/);
assert.match(runner, /EXPECTED_SUPABASE_FINGERPRINT/);
assert.match(runner, /STAGING_TURNSTILE_SITE_KEY = "1x00000000000000000000AA"/);
assert.match(runner, /STAGING_TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA"/);
assert.match(runner, /STAGING_TURNSTILE_TEST_TOKEN = "XXXX\.DUMMY\.TOKEN\.XXXX"/);
assert.match(runner, /NEXT_PUBLIC_LEAD_TURNSTILE_SITE_KEY: STAGING_TURNSTILE_SITE_KEY/);
assert.match(runner, /TURNSTILE_SECRET_KEY: STAGING_TURNSTILE_SECRET_KEY/);
assert.match(runner, /TURNSTILE_ALLOWED_HOSTNAMES: EXPECTED_APP_ALIASES/);
assert.match(runner, /\.map\(\(\{ host \}\) => host\)/);
assert.match(runner, /\.join\(","\)/);
assert.match(providerIndependentProof, /turnstile_token: STAGING_TURNSTILE_TEST_TOKEN/);
assert.match(providerIndependentProof, /requires the exact staging Turnstile test token/);
assert.match(runner, /STAGING_SYNTHETIC_PROVIDER_SESSION_BUNDLE: providerSessionBundleJson/);
assert.match(runner, /STAGING_SYNTHETIC_BROWSER_SESSION_BUNDLE: browserSessionBundleJson/);
assert.match(browserSpec, /installBrowserContextNetworkBoundary\(context/);
assert.match(safeBrowserSpec, /installBrowserContextNetworkBoundary\(context/);
assert.doesNotMatch(browserSpec, /page\.route\("\*\*\/\*"/);
assert.doesNotMatch(safeBrowserSpec, /page\.route\("\*\*\/\*"/);
assert.match(browserSpec, /blockedWebSockets/);
assert.match(safeBrowserSpec, /blockedWebSockets/);
assert.match(safeBrowserSpec, /const READ_ONLY_METHODS = new Set\(\["GET", "HEAD", "OPTIONS"\]\)/);
assert.match(safeBrowserSpec, /requestUrl\.username === ""/);
assert.match(browserSpec, /!\["GET", "HEAD", "OPTIONS"\]\.includes\(method\)/);
assert.match(browserSpec, /url\.username === ""/);
assert.match(browserSpec, /scopedStagingAccessHeaders\(\{/);
assert.match(safeBrowserSpec, /scopedStagingAccessHeaders\(\{/);
assert.match(browserSpec, /stagingAccessCookiesForOrigins\(\{/);
assert.match(safeBrowserSpec, /stagingAccessCookiesForOrigins\(\{/);
const multiRoleBoundarySource = browserSpec.slice(
  browserSpec.indexOf("async function installFailClosedNetworkBoundary("),
  browserSpec.indexOf("function assertDiagnosticsClean("),
);
const safeBoundarySource = safeBrowserSpec.slice(
  safeBrowserSpec.indexOf("async function installSafetyHarness("),
  safeBrowserSpec.indexOf("function diagnosticsFor("),
);
for (const [label, source] of [
  ["multi-role", multiRoleBoundarySource],
  ["safe", safeBoundarySource],
]) {
  assert.match(source, /context\.addCookies\(/, `${label} boundary must install host-only gate cookies`);
  assert.match(source, /await route\.continue\(\)/, `${label} boundary must continue without header overrides`);
  assert.match(source, /context\.on\("request"/, `${label} boundary must detect redirect targets`);
  assert.doesNotMatch(
    source,
    /scopedStagingAccessHeaders|route\.continue\(\{\s*headers/,
    `${label} boundary must not carry gate headers through redirects`,
  );
}
assert.match(browserSpec, /stagingAppHeaders\(/);
assert.match(safeBrowserSpec, /appRequestHeaders\(/);
assert.match(browserContextBoundary, /context\.route\("\*\*\/\*"/);
assert.match(browserContextBoundary, /context\.routeWebSocket\(\/\.\*\//);
assert.match(browserContextBoundary, /webSocketRoute\.close\(/);
assert.match(browserContextBoundaryTest, /forbidden\.example\/popup/);
assert.match(browserContextBoundaryTest, /wss:\/\/user:secret@forbidden\.example/);
assert.match(browserContextBoundaryTest, /WebSocket evidence must not retain credentials/);
assert.match(browserContextBoundaryTest, /staging access gate leaked to/);
assert.match(browserContextBoundaryTest, /stagingAccessCookiesForOrigins\(\{/);
assert.match(browserContextBoundaryTest, /Object\.hasOwn\(cookie, "domain"\)/);
assert.match(browserContextBoundaryTest, /source\.localhost/);
assert.match(browserContextBoundaryTest, /target\.localhost/);
assert.match(browserContextBoundaryTest, /provider-return/);
assert.match(browserContextBoundaryTest, /provider-callback/);
assert.match(browserContextBoundaryTest, /project\.supabase\.co/);
assert.match(browserContextBoundaryTest, /challenges\.cloudflare\.com/);
assert.match(browserContextBoundaryTest, /user:pass@staging\.example\.test/);
assert.match(runner, /nonDeliveringAdminMagicLinkCount: roleNames.length/);
assert.match(runner, /portfolioPasswordSignInCount: 0/);
assert.match(runner, /rawTokenPersisted: false/);
assert.match(runner, /rawCookiePersisted: false/);
assert.match(
  runner,
  /phase: "rls_cross_tenant",[\s\S]{0,200}minimumRequiredLifetimeSeconds: 30 \* 60/,
);
assert.match(
  runner,
  /phase: "rls_fixture",[\s\S]{0,200}minimumRequiredLifetimeSeconds: 30 \* 60/,
);
assert.match(
  runner,
  /phase: "provider_independent",[\s\S]{0,200}minimumRequiredLifetimeSeconds: 30 \* 60/,
);
assert.match(
  runner,
  /phase: "multi_role_browser",[\s\S]{0,200}minimumRequiredLifetimeSeconds: 50 \* 60/,
);
assert.match(
  runner,
  /phase: "safe_browser",[\s\S]{0,200}minimumRequiredLifetimeSeconds: 50 \* 60/,
);
assert.match(runner, /phaseSpecificJustInTimeSessions: true/);
assert.match(runner, /everySyntheticUserRefreshSessionGloballySignedOutAfterItsPhase: true/);
assert.match(runner, /accessJwtImmediateRevocationClaimed: false/);
assert.match(runner, /accessJwtDispositionAfterSignOut: "VALID_UNTIL_EXPIRY"/);
assert.match(runner, /portfolioAccessJwtMaxResidualLifetimeSeconds/);
assert.match(runner, /exactGlobalResidualAccessJwtLifetimeClaimed: false/);
assert.match(runner, /browserAdditionalAccessJwtExpiryPersisted: false/);
assert.match(runner, /portfolioSessionCount/);
assert.match(runner, /browserCredentialPasswordSessionCount: browserProjectCount/);
assert.match(runner, /qaHarnessAdminMagicLinkSessionCount: browserProjectCount/);
assert.doesNotMatch(runner, /everySyntheticUserSessionGloballyRevokedAfterItsPhase/);
assert.doesNotMatch(runner, /activeSyntheticSessions/);
assert.match(runner, /refreshTokenReuseAcrossProofPhases: false/);
assert.match(runner, /failureContext.transientSecrets/);
assert.match(runner, /admin\.auth\.admin\.signOut\(session\.accessToken, "global"\)/);
assert.match(runner, /refresh_token_not_found/);
assert.match(runner, /refresh_token_already_used/);
assert.match(runner, /refreshed\.error\?\.status === 400/);
assert.match(runner, /refresh-token invalidation could not be distinguished from provider or transport failure/);
assert.match(runner, /revokeAllPendingSyntheticUserRefreshSessions/);
assert.match(providerIndependentProof, /validator\.auth\.getUser\(session\.accessToken\)/);
assert.doesNotMatch(providerIndependentProof, /signInWithPassword/);
assert.doesNotMatch(providerIndependentProof, /STAGING_QA_PASSWORD/);
const multiRoleEnvironmentSource = runner.slice(
  runner.indexOf("function multiRoleBrowserEnvironment("),
  runner.indexOf("function safeProductBrowserEnvironment("),
);
const safeEnvironmentSource = runner.slice(
  runner.indexOf("function safeProductBrowserEnvironment("),
  runner.indexOf("function percentile("),
);
const hostedEnvironmentSource = runner.slice(
  runner.indexOf("function hostedStagingEnvironment("),
  runner.indexOf("function prepareEvidenceDirectory("),
);
const hostedSecretNameSource = runner.slice(
  runner.indexOf("const HOSTED_SECRET_ENV_NAMES"),
  runner.indexOf("const PRODUCTION_OR_SHARED_HOSTS"),
);
const runPlaywrightSuiteSource = runner.slice(
  runner.indexOf("async function runPlaywrightSuite("),
  runner.indexOf("function multiRoleBrowserEnvironment("),
);
const browserBypassEnvironmentSource = runner.slice(
  runner.indexOf("function browserVercelAutomationBypassEnvironment("),
  runner.indexOf("function multiRoleBrowserEnvironment("),
);
assert.match(multiRoleEnvironmentSource, /STAGING_QA_PASSWORD/);
assert.match(multiRoleEnvironmentSource, /SAFE_E2E_INTERNAL_SECRET/);
assert.doesNotMatch(multiRoleEnvironmentSource, /STAGING_ACCEPTANCE_INTERNAL_SECRET/);
assert.doesNotMatch(multiRoleEnvironmentSource, /PARTNER_ATTRIBUTION_SIGNING_SECRET/);
assert.doesNotMatch(multiRoleEnvironmentSource, /INTERNAL_ADMIN_EMAILS/);
assert.match(safeEnvironmentSource, /SAFE_E2E_INTERNAL_SECRET/);
assert.doesNotMatch(safeEnvironmentSource, /STAGING_QA_PASSWORD/);
assert.doesNotMatch(safeEnvironmentSource, /PARTNER_ATTRIBUTION_SIGNING_SECRET/);
assert.doesNotMatch(safeEnvironmentSource, /INTERNAL_ADMIN_EMAILS/);
assert.doesNotMatch(safeEnvironmentSource, /STAGING_ACCEPTANCE_INTERNAL_SECRET/);
assert.doesNotMatch(safeEnvironmentSource, /QA_EMAIL/);
assert.match(multiRoleEnvironmentSource, /STAGING_ACCESS_GATE_SECRET/);
assert.match(safeEnvironmentSource, /STAGING_ACCESS_GATE_SECRET/);
assert.match(
  multiRoleEnvironmentSource,
  /\.\.\.browserVercelAutomationBypassEnvironment\(protectionPortfolio\)/,
);
assert.match(
  safeEnvironmentSource,
  /\.\.\.browserVercelAutomationBypassEnvironment\(protectionPortfolio\)/,
);
assert.match(
  browserBypassEnvironmentSource,
  /VERCEL_AUTOMATION_BYPASS_SECRET/,
);
let browserBypassSecretReadCount = 0;
const browserBypassSandbox = {
  requiredStrongStagingSecret(name, minimumLength) {
    assert.equal(name, "VERCEL_AUTOMATION_BYPASS_SECRET");
    assert.equal(minimumLength, 32);
    browserBypassSecretReadCount += 1;
    return "v".repeat(48);
  },
};
runInNewContext(
  `${browserBypassEnvironmentSource}\nthis.browserBypassEnvironmentForContract = browserVercelAutomationBypassEnvironment;`,
  browserBypassSandbox,
);
const unprotectedBrowserEnvironment =
  browserBypassSandbox.browserBypassEnvironmentForContract([{
    origin: "https://stable.example.test",
    vercelAutomationBypassRequired: false,
  }]);
assert.equal(JSON.stringify(unprotectedBrowserEnvironment), "{}");
assert.equal(browserBypassSecretReadCount, 0);
const protectedBrowserEnvironment =
  browserBypassSandbox.browserBypassEnvironmentForContract([
    {
      origin: "https://stable.example.test",
      vercelAutomationBypassRequired: false,
    },
    {
      origin: "https://partner.example.test",
      vercelAutomationBypassRequired: true,
    },
  ]);
assert.equal(
  protectedBrowserEnvironment.VERCEL_AUTOMATION_BYPASS_SECRET,
  "v".repeat(48),
);
assert.equal(browserBypassSecretReadCount, 1);
assert.match(
  multiRoleEnvironmentSource,
  /VERCEL_AUTOMATION_PROTECTION_PORTFOLIO:\s*JSON\.stringify/,
);
assert.match(
  multiRoleEnvironmentSource,
  /exactAliasAccess\.map\([\s\S]*\(\{ url, vercelAutomationBypassRequired \}\)/,
);
assert.match(
  safeEnvironmentSource,
  /VERCEL_AUTOMATION_PROTECTION_PORTFOLIO:\s*JSON\.stringify/,
);
assert.match(safeEnvironmentSource, /origin: stableAliasAccess\.url/);
assert.doesNotMatch(hostedEnvironmentSource, /VERCEL_AUTOMATION_BYPASS_SECRET/);
assert.doesNotMatch(
  hostedEnvironmentSource,
  /VERCEL_AUTOMATION_PROTECTION_PORTFOLIO/,
);
assert.doesNotMatch(hostedSecretNameSource, /VERCEL_AUTOMATION_BYPASS_SECRET/);
assert.ok(
  (runPlaywrightSuiteSource.match(/process\.env\.VERCEL_AUTOMATION_BYPASS_SECRET/g) ?? [])
    .length >= 2,
  "the browser command and its artifact sanitizer must both protect the Vercel bypass secret",
);
assert.match(browserConfig, /VERCEL_AUTOMATION_BYPASS_SECRET/);
assert.match(safeBrowserConfig, /VERCEL_AUTOMATION_BYPASS_SECRET/);
assert.doesNotMatch(browserConfig, /extraHTTPHeaders/);
assert.doesNotMatch(safeBrowserConfig, /extraHTTPHeaders/);
assert.match(browserSpec, /primeVercelAutomationBypassCookies\(\{/);
assert.match(safeBrowserSpec, /primeVercelAutomationBypassCookies\(\{/);
assert.match(
  browserSpec,
  /serializedProtectionPortfolio = requiredEnvironment\([\s\S]*VERCEL_AUTOMATION_PROTECTION_PORTFOLIO/,
);
assert.match(browserSpec, /serializedProtectionPortfolio,/);
assert.match(
  safeBrowserSpec,
  /serializedProtectionPortfolio =[\s\S]*VERCEL_AUTOMATION_PROTECTION_PORTFOLIO/,
);
assert.match(safeBrowserSpec, /serializedProtectionPortfolio,/);
assert.match(globalSafetyPreflight, /vercelAutomationBypassHeadersForExactOrigin\(\{/);
assert.match(
  globalSafetyPreflight,
  /vercelProtection\.vercelAutomationBypassRequired[\s\S]*\? vercelAutomationBypassHeadersForExactOrigin/,
);
assert.match(
  browserContextBoundary,
  /exactVercelAutomationProtectionPortfolio/,
);
assert.match(browserContextBoundary, /maxRedirects: 0/);
assert.match(browserContextBoundary, /responseStatus !== 307/);
assert.match(browserContextBoundary, /resolvedResponseLocation !== requestUrl/);
assert.match(browserContextBoundary, /VERCEL_AUTOMATION_BYPASS_COOKIE = "_vercel_jwt"/);
assert.match(browserContextBoundaryTest, /redirect-followed/);
assert.match(browserContextBoundaryTest, /domain-cookie/);
assert.match(browserContextBoundaryTest, /an inexact origin reached the priming transport/);
assert.match(browserContextBoundaryTest, /mixedProtectionPortfolio/);
assert.match(
  browserContextBoundaryTest,
  /the unprotected stable alias received a Vercel bypass request/,
);
assert.match(browserContextBoundaryTest, /partialFailureCookies\.size, 0/);
assert.match(safeBrowserSpec, /page\.request\.fetch\(target\.toString\(\), \{/);
assert.match(safeBrowserSpec, /target\.origin !== EXPECTED_HOSTED_SAFE_BROWSER_ORIGIN/);
assert.match(safeBrowserSpec, /target\.pathname !== "\/api\/internal\/qa-auth-session"/);
assert.match(safeBrowserSpec, /maxRedirects: 0/);
const qaHarnessClientSource = safeBrowserSpec.slice(
  safeBrowserSpec.indexOf("async function establishQaHarnessSession("),
  safeBrowserSpec.indexOf("async function establishQaSession("),
);
assert.doesNotMatch(qaHarnessClientSource, /page\.evaluate/);
assert.doesNotMatch(safeBrowserSpec, /process\.env\.INTERNAL_SYSTEM_JOBS_SECRET/);
assert.doesNotMatch(safeBrowserSpec, /process\.env\.CRON_SECRET/);
assert.doesNotMatch(globalSafetyPreflight, /process\.env\.INTERNAL_SYSTEM_JOBS_SECRET/);
assert.doesNotMatch(globalSafetyPreflight, /process\.env\.CRON_SECRET/);
assert.doesNotMatch(browserSpec, /STAGING_ACCEPTANCE_INTERNAL_SECRET/);
assert.equal(
  (safeBrowserSpec.match(/page\.request\.(?:get|fetch)\s*\(/g) ?? []).length,
  (safeBrowserSpec.match(/maxRedirects:\s*0/g) ?? []).length,
  "every safe APIRequestContext call carrying the staging gate must refuse redirects",
);
assert.equal(
  (browserSpec.match(/page\.request\.(?:get|fetch)\s*\(/g) ?? []).length,
  (browserSpec.match(/maxRedirects:\s*0/g) ?? []).length,
  "every staging APIRequestContext call carrying the staging gate must refuse redirects",
);
assert.match(globalSafetyPreflight, /redirect: "manual"/);
assert.match(globalSafetyPreflight, /response\.url !== endpoint\.toString\(\)/);
assert.match(runner, /EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT/);
assert.match(runner, /EXPECTED_VERCEL_ORG_ID_FINGERPRINT/);
assert.match(runner, /EXPECTED_MIGRATION_COUNT = 104/);
assert.match(runner, /20260715010000_move_legacy_org_member_policies_private\.sql/);
assert.match(runner, /AUTHORIZE_ISOLATED_STAGING_ACCEPTANCE_V1/);

const authoritativeFalseControls = extractStringArray(zeroEffectsSource, "MUST_BE_FALSE");
const authoritativeEqualControls = extractStringObject(zeroEffectsSource, "MUST_EQUAL");
const authoritativeDisabledControls = extractStringArray(
  zeroEffectsSource,
  "MUST_BE_DISABLED_OR_EMPTY",
);
assert.deepEqual(
  extractStringArray(runner, "REQUIRED_FALSE_CONTROLS"),
  authoritativeFalseControls,
  "staging false controls must exactly match the central zero-effects contract",
);
assert.deepEqual(
  extractStringObject(runner, "REQUIRED_EQUAL_CONTROLS"),
  authoritativeEqualControls,
  "staging exact-value controls must exactly match the central zero-effects contract",
);
assert.deepEqual(
  extractStringArray(runner, "REQUIRED_DISABLED_OR_EMPTY_CONTROLS"),
  authoritativeDisabledControls,
  "staging disabled-or-empty controls must exactly match the central zero-effects contract",
);
const authoritativeZeroEffectControlCount =
  authoritativeFalseControls.length +
  Object.keys(authoritativeEqualControls).length +
  authoritativeDisabledControls.length;
assert.equal(authoritativeZeroEffectControlCount, 60);
assert.match(runner, /EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT = 60/);
assert.match(
  runner,
  /Number\(payload\.checkedControlCount\) !== EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT/,
);
assert.match(browserSpec, /EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT = 60/);
assert.match(
  browserSpec,
  /Number\(body\?\.checkedControlCount\)\)\.toBe\(EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT\)/,
);

const flagGate = runner.indexOf("const migrationModeCount =");
const releaseCapture = runner.indexOf("const identity = captureExactReleaseIdentity()");
assert.ok(flagGate >= 0 && releaseCapture > flagGate, "all execution flags must gate any release or remote work");
assert.match(
  runner,
  /Number\(options\.applyMigrations\) \+[\s\S]+Number\(options\.applyForwardMigration\) \+[\s\S]+Number\(options\.verifyExistingMigrations\)/,
);
assert.match(runner, /migrationModeCount !== 1/);
assert.match(runner, /Read-only resume and exact forward mode require --prior-migration-proof-dir/);
assert.match(runner, /migrationBrokerArgs\.push\([\s\S]*"--verify-existing-exact"/);
assert.match(runner, /migrationBrokerArgs\.push\([\s\S]*"--apply-forward-exact"/);
assert.match(runner, /migrationSummary\.migrationMode === "VERIFY_EXISTING_EXACT"/);
assert.match(runner, /isExactSafeStagingAuthSurfaceProof/);
assert.match(runner, /migrationSummary\.authUserSurfaceAtVerification/);
assert.match(runner, /migrationSummary\.authUserCountAtVerification/);
assert.match(runner, /migrationSummary\.migrationMode === "APPLY_FORWARD_EXACT"/);
assert.match(runner, /migrationSummary\.serviceRoleColumnWritePrivilegesPresent !== false/);
assert.match(runner, /migrationSummary\.anonColumnPrivilegesPresent !== false/);
assert.match(runner, /migrationSummary\.authenticatedColumnPrivilegesPresent !== false/);
assert.match(runner, /migrationSummary\.publicColumnAclPresent !== false/);
assert.match(runner, /migrationSummary\.retentionConfigurationRelationOwner !== "postgres"/);
assert.match(runner, /migrationSummary\.retentionConfigurationRowSecurityEnabled !== true/);
assert.match(runner, /migrationSummary\.retentionConfigurationRowSecurityForced !== true/);
assert.match(runner, /migrationSummary\.serviceRoleTableWritePrivileges/);
assert.match(runner, /maintain: false/);
assert.match(runner, /migrationSummary\.serviceRoleColumnWritePrivileges/);
assert.match(runner, /portfolioApplicationRemoteMutationCompleted === true/);
assert.match(runner, /EXACT_EXISTING_COMMITTED_PORTFOLIO/);
assert.match(
  runner,
  /\[\s*"EXACT_COMMITTED_PORTFOLIO",\s*"EXACT_EXISTING_COMMITTED_PORTFOLIO",\s*"EXACT_FORWARD_COMMITTED_PORTFOLIO",\s*\]\.includes\(migrationSummary\.remoteStateVerificationStatus\)/,
  "the common final gate must accept exact fresh, read-only resume, or one-migration forward status",
);
assert.match(runner, /verify retained prior migration application tree/);
assert.match(runner, /verify prior migration application ancestry/);
assert.match(runner, /priorApplicationRetainedHistory/);
assert.match(runner, /isExactCurrentResumeIdentity/);
assert.match(priorProofContract, /priorApplication\.manifestSha256/);
assert.match(priorProofContract, /priorApplication\.structuralCatalogSha256/);
assert.match(priorProofContract, /priorApplication\.migrationCount === expectedMigrationCount/);
assert.match(priorProofContract, /priorApplication\.migrationFiles/);
assert.match(priorProofContract, /portfolioApplicationRemoteMutationCompleted === true/);
assert.match(priorProofContract, /committed_forward_recovery/);
assert.match(priorProofContract, /EXACT_SYNTHETIC_FIXTURE_SET/);
assert.match(priorProofContract, /rawIdentityValuesPersisted: false/);
assert.match(runner, /EXPECTED_PRIOR_MIGRATION_APPLICATION_COMMIT/);
assert.match(runner, /EXPECTED_PRIOR_MIGRATION_APPLICATION_TREE/);
assert.match(runner, /EXPECTED_PRIOR_MIGRATION_MANIFEST_SHA256/);
assert.match(runner, /EXPECTED_PRIOR_MIGRATION_PORTFOLIO_SHA256/);
const currentResumeGate = runner.slice(
  runner.indexOf("const verifiedExistingExact ="),
  runner.indexOf("const exactForwardApplication ="),
);
assert.match(currentResumeGate, /exactCurrentResumePriorIdentity/);
assert.doesNotMatch(
  currentResumeGate,
  /EXPECTED_PRIOR_MIGRATION_(?:APPLICATION|MANIFEST|PORTFOLIO)/,
  "current-104 resume must not require the pinned migration-103 identity",
);
const pinnedForwardGate = runner.slice(
  runner.indexOf("const exactForwardApplication ="),
  runner.indexOf("if (\n    migrationSummary.status"),
);
assert.match(pinnedForwardGate, /EXPECTED_PRIOR_MIGRATION_APPLICATION_COMMIT/);
assert.match(pinnedForwardGate, /EXPECTED_PRIOR_MIGRATION_APPLICATION_TREE/);
assert.match(pinnedForwardGate, /EXPECTED_PRIOR_MIGRATION_MANIFEST_SHA256/);
assert.match(pinnedForwardGate, /EXPECTED_PRIOR_MIGRATION_PORTFOLIO_SHA256/);
assert.match(runner, /DEALFLOW_STAGING_ACCEPTANCE_AUTHORIZATION !== EXECUTION_AUTHORIZATION/);
assert.match(runner, /Staging acceptance requires Node 24/);
assert.match(runner, /!\/\^v24\\\.\/.+parsed\.runtime/s);
assert.match(runner, /requires a completely clean release worktree/);
assert.match(runner, /requires the exact release branch/);
assert.match(runner, /Tracked staging source must be a regular file/);
assert.match(runner, /The exact \$\{EXPECTED_MIGRATION_COUNT\}-migration portfolio is required/);

assert.match(runner, /dealflow\.final-verification\.v3/);
assert.match(runner, /final-verification-command-contract\.mjs/);
assert.match(runner, /assertExactFinalVerificationSummaryPortfolio\(parsed, `\$\{label\} portfolio`\)/);
assert.match(runner, /NO_GO_AUTHENTICATED_PROOF_DEFERRED/);
for (const deferred of [
  "npm run rls:cross-tenant",
  "npm run rls:fixture-smoke",
  "npm run operator:debt",
]) {
  assert.match(runner, new RegExp(deferred.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(runner, /parsed\.blockedCount !== EXPECTED_HOSTED_DEFERRALS\.length/);
assert.match(runner, /item\.status !== "authenticated_deferred"/);
assert.match(runner, /record\.status !== "passed"/);
assert.match(runner, /record\.exitCode !== 0/);
assert.match(runner, /record\.postCommandRepositoryInvariant !== "passed"/);
assert.match(runner, /record\.workingDirectory !== EXPECTED_REPO/);

for (const control of [
  "ALLOW_BILLING_ADMIN_OVERRIDE",
  "ALLOW_QA_BILLING_ACCEPTANCE_OVERRIDE",
  "STRIPE_FORCE_TEST_MODE",
  "NEXT_PUBLIC_ENABLE_GOOGLE_AUTH",
  "ENABLE_STRUCTURED_INFO_LOGS",
  "LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED",
  "LOAD_TEST_ALLOW_SYNTHETIC_LEAD_CAPTURE",
  "ALLOW_HEYGEN_LEGACY_FALLBACK",
  "ACCOUNT_DELETION_EXECUTION_ENABLED",
  "ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED",
]) {
  assert.match(runner, new RegExp(`"${control}"`), `missing zero-effects control ${control}`);
}
for (const exactControl of [
  "NEXT_TELEMETRY_DISABLED",
  "TWILIO_EXECUTION_MODE",
  "META_EXECUTION_MODE",
  "META_OPTIMIZATION_EXECUTION_MODE",
  "SUPPORT_NOTIFICATION_DELIVERY_MODE",
  "BILLING_CHECKOUT_SAFE_MODE",
  "UI_DIRECTION_PREVIEW",
]) {
  assert.match(runner, new RegExp(`${exactControl}:`), `missing exact control ${exactControl}`);
}
assert.match(runner, /DEALFLOW_STAGING_VERCEL_PROJECT_ID: vercelProjectId/);
assert.match(runner, /process\.env\.VERCEL_PROJECT_ID !== String\(project\.projectId\)/);
assert.match(runner, /process\.env\.VERCEL_ORG_ID !== String\(project\.orgId\)/);
assert.match(runner, /authority conflicts with the validated staging link/);
assert.match(runner, /DEALFLOW_STAGING_HOST_ATTESTATION: "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1"/);
assert.match(runner, /QA_AUTH_HARNESS_ENABLED: "true"/);
assert.match(runner, /INTERNAL_SYSTEM_JOBS_SECRET/);
assert.doesNotMatch(runner, /STAGING_ACCEPTANCE_INTERNAL_SECRET", 32/);
assert.doesNotMatch(runner, /STRIPE_FORCE_TEST_MODE !== "true"/);
assert.match(runner, /Provider credentials must be absent from the acceptance process/);
assert.match(runner, /function protectedRuntimeValues\(\)/);
for (const protectedName of [
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STAGING_QA_PASSWORD",
  "PARTNER_ATTRIBUTION_SIGNING_SECRET",
  "INTERNAL_SYSTEM_JOBS_SECRET",
]) {
  assert.match(
    runner,
    new RegExp(`process\\.env\\.${protectedName}`),
    `missing failure-path redaction for ${protectedName}`,
  );
}
assert.match(
  runner,
  /\[\.\.\.protectedRuntimeValues\(\), \.\.\.failureContext\.transientSecrets\]/,
);

const configureIndex = runner.indexOf("await configureHostedStagingEnvironment(");
const vercelDryRunIndex = runner.indexOf(
  "await proveExactVercelDryRunSourcePortfolio(vercel)",
);
const predeployAliasAuthorityIndex = runner.indexOf(
  "await proveAuthoritativePreDeployAliasOwnership(vercel)",
);
const predeploymentProtectionIndex = runner.indexOf(
  "const preDeploymentProtectionProof = await configureHostedStagingProtection(",
);
const postdeploymentProtectionIndex = runner.indexOf(
  "const postDeploymentProtectionProof = await verifyHostedStagingProtection(",
);
const roundReaderStart = runner.indexOf("function readValidatedRound(");
const roundReaderEnd = runner.indexOf("\nfunction childBaseEnvironment", roundReaderStart);
const roundReaderSource = runner.slice(roundReaderStart, roundReaderEnd);
const roundOneValidationIndex = runner.indexOf("const roundOne = readValidatedRound(");
const roundTwoValidationIndex = runner.indexOf("const roundTwo = readValidatedRound(");
const stagingEvidencePreparationIndex = runner.indexOf(
  "prepareEvidenceDirectory(options.evidenceDir)",
);
const migrationIndex = runner.indexOf("const migrationBrokerArgs = [");
const retentionAuthorityIndex = runner.indexOf(
  'failureContext.stage = "synthetic_retention_owner_authority"',
);
const deployIndex = runner.indexOf("const deployment = await deployExactCommit(identity, vercel)");
const immediatePreDeployIdentityIndex = runner.indexOf(
  'failureContext.stage = "immediate_predeployment_source_revalidation"',
);
const immediatePreDeployDryRunIndex = runner.indexOf(
  "const immediatePreDeploymentVercelDryRunSourceProof =",
);
const postDeployIdentityIndex = runner.indexOf(
  'failureContext.stage = "postdeployment_source_revalidation"',
);
const predeployClosedSurfaceIndex = runner.indexOf(
  "await proveClosedPreDeployAppAliasSurface()",
);
const uniqueProtectionIndex = runner.indexOf(
  "await proveUniqueDeploymentProtectionRedirect(",
);
const stableGateIndex = runner.indexOf(
  "await proveExactPostDeployAppAliasGate(stableAliasAccess)",
);
const stablePropagationIndex = runner.indexOf(
  "const stableAliasPropagation =",
);
const stableIdentityIndex = runner.indexOf(
  "const stableIdentityImmediatelyAfterAlias =",
);
const partnerOneAliasIndex = runner.indexOf("const partnerOneAlias =");
const partnerOneGateIndex = runner.indexOf(
  "const partnerOneGateImmediatelyAfterAlias =",
);
const partnerOnePropagationIndex = runner.indexOf(
  "const partnerOneAliasPropagation =",
);
const partnerOneIdentityIndex = runner.indexOf(
  "const partnerOneIdentityImmediatelyAfterAlias =",
);
const partnerTwoAliasIndex = runner.indexOf("const secondPartnerAlias =");
const partnerTwoGateIndex = runner.indexOf(
  "const secondPartnerGateImmediatelyAfterAlias =",
);
const partnerTwoPropagationIndex = runner.indexOf(
  "const secondPartnerAliasPropagation =",
);
const partnerTwoIdentityIndex = runner.indexOf(
  "const secondPartnerIdentityImmediatelyAfterAlias =",
);
const firstReadinessIndex = runner.indexOf(
  "const stableReady = await waitForDeployment(",
);
const seedIndex = runner.indexOf("const seedOne = await runSeed(");
assert.ok(configureIndex > releaseCapture, "hosted config must follow complete local readiness");
assert.ok(
  vercelDryRunIndex > releaseCapture && vercelDryRunIndex < configureIndex,
  "Vercel's exact no-upload source inventory must pass before hosted environment configuration",
);
assert.match(runner, /"deploy",\s*"--dry",\s*"--format=json"/);
assert.match(runner, /assertExactVercelDryRunSourcePortfolio\(\{/);
assert.match(runner, /NEXT_PUBLIC_DEALFLOW_VERCEL_DRY_RUN_SOURCE_SHA256:/);
assert.match(runner, /NEXT_PUBLIC_DEALFLOW_VERCEL_DRY_RUN_FILE_COUNT:/);
assert.match(runner, /assertExactHostedBuildSourceIdentity\(\{/);
assert.match(runner, /vercel-dry-run-source-proof\.json/);
assert.ok(
  predeployClosedSurfaceIndex > releaseCapture && predeployClosedSurfaceIndex < configureIndex,
  "all three app aliases must prove closed before hosted environment or deployment work",
);
assert.ok(
  predeployAliasAuthorityIndex < predeploymentProtectionIndex &&
    predeploymentProtectionIndex < deployIndex &&
    deployIndex < postdeploymentProtectionIndex &&
    postdeploymentProtectionIndex < uniqueProtectionIndex &&
    uniqueProtectionIndex < stableGateIndex &&
    stableGateIndex < stableIdentityIndex &&
    stableIdentityIndex < firstReadinessIndex,
  "standard protection, the unique redirect, and the stable app gate and identity must be proven before app-alias readiness",
);
assert.ok(
  uniqueProtectionIndex < stablePropagationIndex &&
    stablePropagationIndex < stableGateIndex,
  "the stable alias must finish its bounded unauthenticated edge-propagation proof before any credentialed gate probe",
);
assert.ok(
  predeploymentProtectionIndex < immediatePreDeployIdentityIndex &&
    immediatePreDeployIdentityIndex < immediatePreDeployDryRunIndex &&
    immediatePreDeployDryRunIndex < deployIndex &&
    deployIndex < postDeployIdentityIndex &&
    postDeployIdentityIndex < postdeploymentProtectionIndex,
  "exact source identity and Vercel dry-run portfolio must be revalidated immediately before upload and source identity rechecked immediately after",
);
assert.match(runner, /function assertExactReleaseIdentityUnchanged\(expected, label\)/);
assert.match(runner, /JSON\.stringify\(current\) !== JSON\.stringify\(expected\)/);
assert.match(runner, /function assertExactVercelDryRunProofUnchanged\(expected, current, label\)/);
assert.match(runner, /await proveExactVercelDryRunSourcePortfolio\(vercel\)/);
assert.match(runner, /deployment-source-revalidation\.json/);
assert.match(runner, /exactIdentityBeforeAndAfterUpload: true/);
assert.match(
  runner,
  /exactVercelSourcePortfolioRevalidatedImmediatelyBeforeUpload: true/,
);
assert.ok(
  stableIdentityIndex < partnerOneAliasIndex &&
    partnerOneAliasIndex < partnerOnePropagationIndex &&
    partnerOnePropagationIndex < partnerOneGateIndex &&
    partnerOneGateIndex < partnerOneIdentityIndex &&
    partnerOneIdentityIndex < partnerTwoAliasIndex &&
    partnerTwoAliasIndex < partnerTwoPropagationIndex &&
    partnerTwoPropagationIndex < partnerTwoGateIndex &&
    partnerTwoGateIndex < partnerTwoIdentityIndex &&
    partnerTwoIdentityIndex < firstReadinessIndex,
  "each exact alias must prove its gate and build identity before the next alias can be assigned",
);
assert.match(runner, /async function configureHostedStagingProtection\(vercel, projectId\)/);
assert.match(runner, /configureExactStagingVercelProtection\(\{/);
assert.match(runner, /expectedProjectIdFingerprint: EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT/);
assert.match(runner, /expectedOrganizationIdFingerprint: EXPECTED_VERCEL_ORG_ID_FINGERPRINT/);
assert.match(runner, /args\.push\("--method", "PATCH", "--input", "-"\)/);
assert.match(
  runner,
  /writeJson\(\s*join\(options\.evidenceDir, "staging-protection\.json"\)/,
);
assert.match(runner, /classifyStagingHostReadiness\(\{ status: response\.status \}\)/);
assert.match(runner, /error instanceof StagingHostRedirectError/);
assert.match(
  vercelProtectionContract,
  /const REQUIRED_PROTECTION_MODE = "all_except_custom_domains"/,
);
assert.match(vercelProtectionContract, /const REDIRECT_STATUSES = new Set\(\[301, 302, 303, 307, 308\]\)/);
assert.match(vercelProtectionTest, /wrong input project must be blocked before any API request/);
assert.match(vercelProtectionTest, /assert\.deepEqual\(call\.body/);
assert.match(vercelProtectionTest, /\["GET", "PATCH", "GET"\]/);
assert.match(vercelProtectionTest, /for \(const status of \[301, 302, 303, 307, 308\]\)/);
assert.match(runner, /async function waitForExactAppAliasPropagation\(\s*alias,\s*evidenceDir,\s*vercel,\s*deployment,\s*\)/);
assert.match(runner, /waitForExactAliasPropagation\(\{/);
assert.match(runner, /EXACT_ALIAS_PROPAGATION_TIMEOUT_MS/);
assert.match(runner, /EXACT_ALIAS_PROPAGATION_POLL_INTERVAL_MS/);
assert.match(runner, /EXACT_ALIAS_PROPAGATION_REQUEST_TIMEOUT_MS/);
assert.match(runner, /alias-edge-propagation-\$\{alias\.label\}\.json/);
assert.match(runner, /intermediateDispositionAllowed: "VERCEL_DEPLOYMENT_NOT_FOUND"/);
assert.match(
  runner,
  /DEALFLOW_APPLICATION_GATE_OR_EXACT_GATE_BEHIND_VERCEL_AUTOMATION_PROTECTION/,
);
assert.match(runner, /gateCredentialSentDuringWait: false/);
assert.match(runner, /VERCEL_PROTECTION_BYPASS_HEADER = "x-vercel-protection-bypass"/);
assert.match(runner, /process\.env\.VERCEL_AUTOMATION_BYPASS_SECRET/);
assert.match(
  runner,
  /requiredStrongStagingSecret\("VERCEL_AUTOMATION_BYPASS_SECRET", 32\)/,
);
assert.match(runner, /withVercelAutomationBypass\(\{\}, true\)/);
assert.match(runner, /bypassReachedExactApplicationGate/);
assert.match(runner, /protectionBypass\.status === 404/);
assert.match(runner, /protectionBypass\.disposition === "DEALFLOW_APPLICATION_GATE"/);
assert.match(runner, /vercelAutomationBypassSecretPersistedToEvidence: false/);
assert.match(runner, /publicWindowObserved: false/);
assert.match(runner, /threeAliasEdgePropagationPassed: true/);
assert.match(vercelAliasPropagationContract, /EXACT_ALIAS_PROPAGATION_TIMEOUT_MS = 180_000/);
assert.match(vercelAliasPropagationContract, /EXACT_ALIAS_PROPAGATION_POLL_INTERVAL_MS = 2_000/);
assert.match(
  vercelAliasPropagationContract,
  /classifyExactVercelAutomationProtectionRedirect/,
);
assert.match(vercelAliasPropagationContract, /status !== 302/);
assert.match(vercelAliasPropagationContract, /location\.origin !== "https:\/\/vercel\.com"/);
assert.match(vercelAliasPropagationContract, /location\.pathname !== "\/sso-api"/);
assert.match(vercelAliasPropagationContract, /\^\[a-f0-9\]\{64\}\$/);
assert.match(vercelAliasPropagationContract, /returnUrl !== endpoint\.toString\(\)/);
assert.match(
  vercelAliasPropagationContract,
  /DEALFLOW_APPLICATION_GATE_BEHIND_VERCEL_AUTOMATION_PROTECTION/,
);
assert.match(vercelAliasPropagationContract, /observation\.redirected !== false/);
assert.match(vercelAliasPropagationContract, /observation\.locationPresent !== false/);
assert.match(vercelAliasPropagationContract, /observation\.responseUrlExact !== true/);
assert.match(vercelAliasPropagationContract, /class ExactAliasPropagationTimeoutError extends Error/);
assert.match(vercelAliasPropagationContract, /class ExactAliasPropagationHardFailureError extends Error/);
assert.match(vercelAliasPropagationContract, /now = \(\) => performance\.now\(\)/);
assert.match(vercelAliasPropagationContract, /mappingProof = await verifyMapping\(\{/);
assert.ok(
  (vercelAliasPropagationContract.match(/if \(now\(\) >= deadline\)/g) ?? []).length >= 3,
  "the hard propagation deadline must be rechecked after probe and mapping work",
);
assert.match(vercelAliasPropagationContract, /await delay\(Math\.min\(pollIntervalMs, remainingMs\)\)/);
assert.match(vercelAliasPropagationTest, /status: 200, disposition: "AUTHORIZED_HTTP_200"/);
assert.match(vercelAliasPropagationTest, /status: 503, disposition: "DEALFLOW_APPLICATION_GATE"/);
assert.match(vercelAliasPropagationTest, /redirected: true/);
assert.match(vercelAliasPropagationTest, /locationPresent: true/);
assert.match(vercelAliasPropagationTest, /responseUrlExact: false/);
assert.match(vercelAliasPropagationTest, /simulated transport failure/);
assert.match(vercelAliasPropagationTest, /simulated mapping drift/);
assert.match(vercelAliasPropagationTest, /simulated termination/);
assert.match(vercelAliasPropagationTest, /requestTimeouts, \[5_000, 3_000, 1_000\]/);
assert.match(vercelAliasPropagationTest, /probeAdvanceMs: 101/);
assert.match(vercelAliasPropagationTest, /mappingAdvanceMs: 101/);
assert.match(vercelAliasPropagationTest, /transientThenPublicError\.safeTerminalObservation\.status, 200/);
assert.match(vercelAliasPropagationTest, /protectedImmediate\.state\.mappingCalls, 1/);
assert.match(vercelAliasPropagationTest, /protectedPublicBypassError/);
assert.match(vercelAliasPropagationTest, /evil\.example/);
assert.match(vercelAliasPropagationTest, /rejectedSecretReads, 0/);
assert.match(vercelAliasPropagationTest, /headerFailureHeaders, \[\{\}, \{ "x-test-gate": "test-secret" \}\]/);
const propagationWaitSource = runner.slice(
  runner.indexOf("async function waitForExactAppAliasPropagation("),
  runner.indexOf("async function proveClosedPreDeployAppAliasSurface("),
);
const aliasEdgeObservationSource = runner.slice(
  runner.indexOf("async function requestExactAppAliasEdgeObservation("),
  runner.indexOf("async function waitForExactAppAliasPropagation("),
);
assert.doesNotMatch(propagationWaitSource, /STAGING_ACCESS_HEADER|STAGING_ACCESS_COOKIE|withStagingAccess/);
assert.doesNotMatch(aliasEdgeObservationSource, /STAGING_ACCESS_HEADER|STAGING_ACCESS_COOKIE|withStagingAccess/);
assert.match(aliasEdgeObservationSource, /withVercelAutomationBypass\(\{\}, true\)/);
assert.match(aliasEdgeObservationSource, /allowDuringTermination/);
assert.match(propagationWaitSource, /post-propagation alias/);
assert.match(propagationWaitSource, /catch \(error\)[\s\S]+throw error/);
assert.match(propagationWaitSource, /mapping\?\.deploymentId !== deployment\.deploymentId/);
assert.match(propagationWaitSource, /allowDuringTermination: true/);
assert.match(propagationWaitSource, /publicWindowProofStatus/);
assert.match(propagationWaitSource, /terminalObservation/);
const exactGateProofSource = runner.slice(
  runner.indexOf("async function proveExactPostDeployAppAliasGate("),
  runner.indexOf("async function provePostDeployAppAliasGate("),
);
assert.match(exactGateProofSource, /proveSequentialExactApplicationGate\(\{/);
assert.match(exactGateProofSource, /getSecret: \(\) => requiredEnvironment\("STAGING_ACCESS_GATE_SECRET", 43\)/);
const sequentialGateContractSource = vercelAliasPropagationContract.slice(
  vercelAliasPropagationContract.indexOf("export async function proveSequentialExactApplicationGate("),
);
assert.ok(
  sequentialGateContractSource.indexOf("const noGate = await request({})") <
    sequentialGateContractSource.indexOf("const secret = getSecret()") &&
    sequentialGateContractSource.indexOf('headerGate.disposition !== "AUTHORIZED_HTTP_200"') <
      sequentialGateContractSource.indexOf("const cookieGate = await request"),
  "the unauthenticated surface and header authorization must each pass before the next credential is loaded or sent",
);
assert.match(
  roundReaderSource,
  /assertExactFinalVerificationSummaryPortfolio\(parsed, `\$\{label\} portfolio`\)/,
  "the executed round reader must enforce the shared exact portfolio",
);
assert.ok(
  releaseCapture < roundOneValidationIndex &&
    roundOneValidationIndex < roundTwoValidationIndex &&
    roundTwoValidationIndex < stagingEvidencePreparationIndex &&
    stagingEvidencePreparationIndex < configureIndex,
  "both exact ordered verification rounds must fail closed before evidence setup or hosted staging configuration",
);
assert.ok(migrationIndex > configureIndex, "migration apply must follow exact hosted config provisioning");
assert.ok(
  retentionAuthorityIndex > migrationIndex,
  "owner-authority retention installation must follow exact migration proof",
);
assert.ok(
  deployIndex > retentionAuthorityIndex,
  "deployment must follow exact migration and owner-authority proofs",
);
assert.ok(seedIndex > deployIndex, "deployment-specific partner host must exist before seeding");
assert.match(
  runner,
  /DEALFLOW_NATIVE_PGBIN: process\.env\.DEALFLOW_NATIVE_PGBIN/,
  "the staging parent must forward the pinned PostgreSQL runtime to the migration broker",
);
assert.match(runner, /install-synthetic-retention-authority\.mjs/);
assert.match(runner, /retentionAuthoritySummary\.serviceRolePrivileges/);
assert.match(runner, /retention-authority-summary\.json/);
assert.match(runner, /Synthetic retention authority evidence directory is not the exact sealed set/);
assert.match(runner, /expectedRetentionChecksum/);
assert.match(runner, /Synthetic retention authority evidence checksum did not verify/);
assert.match(runner, /dealflow\.synthetic-retention-authority\.v1/);
assert.match(runner, /authorityRole !== "postgres"/);
assert.match(runner, /ownerAuthorityVerified !== true/);
assert.match(runner, /EXPECTED_SYNTHETIC_RETENTION_POLICY/);
for (const [field, value] of Object.entries({
  graceDays: 0,
  operationalRetentionDays: 1,
  supportRetentionDays: 1,
  analyticsRetentionDays: 1,
  financialRetentionDays: 365,
  receiptRetentionDays: 365,
  policyVersion: 2,
})) {
  assert.match(runner, new RegExp(`${field}: ${value}`));
}
assert.match(runner, /billingCancellationMode: "period_end"/);
assert.match(runner, /tlsServerAuthentication\?\.mode !== "verify-full"/);
assert.match(runner, /supabase-prod-ca-2021\.crt/);
assert.match(runner, /700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7/);
assert.equal(
  createHash("sha256").update(trustBundle).digest("hex"),
  "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7",
);
assert.match(runner, /serviceRoleSelectOnly !== true/);
assert.match(runner, /anonPrivilegesPresent !== false/);
assert.match(runner, /authenticatedPrivilegesPresent !== false/);
assert.match(runner, /publicAclPresent !== false/);
assert.match(runner, /relationOwner !== "postgres"/);
assert.match(runner, /ownerUpdatePrivilege !== true/);
assert.match(runner, /exactSyntheticMarker !== true/);
assert.match(runner, /retentionAuthorityMode === "pending_only_installed"/);
assert.match(runner, /retentionAuthorityMode === "exact_approved_policy_recovered"/);
assert.match(runner, /retentionAuthorityMode === "exact_existing_reused"/);
assert.match(runner, /customerDataAccessed !== false/);
assert.match(runner, /providerActionPerformed !== false/);
assert.match(runner, /realCustomerDataAccessed !== false/);
assert.match(runner, /communicationSent !== false/);
assert.match(runner, /spendIncurred !== false/);
assert.match(runner, /remoteMutationOutcome ===[\s\S]+exact_pending_only_install_committed/);
assert.match(runner, /remoteMutationOutcome ===[\s\S]+exact_approved_policy_recovery_committed/);
assert.match(runner, /remoteMutationOutcome ===[\s\S]+exact_existing_reused_without_mutation/);
assert.match(runner, /serviceRoleColumnWritePrivilegesPresent !== false/);
assert.match(runner, /publicColumnAclPresent !== false/);
assert.match(runner, /verificationRoundEvidence\.length === 2/);
assert.match(runner, /Number\.isSafeInteger\(record\?\.fileCount\)/);
assert.match(runner, /record\.fileCount > 0/);
assert.match(runner, /record\.evidenceSha256/);
assert.match(runner, /record\.summarySha256/);
assert.match(runner, /"env", "list", "production", "--format=json"/);
assert.match(runner, /"env",\s*"add"/);
assert.match(runner, /input: `\$\{value\}\\n`/);
assert.match(runner, /HOSTED_SECRET_ENV_NAMES\.has\(name\).*--sensitive/s);
assert.match(runner, /isolated Vercel staging environment inventory is not exact after provisioning/);
assert.match(runner, /"deploy",\s*"--prod"/);
assert.match(runner, /"--prod",\s*"--skip-domain"/);
assert.match(runner, /dealflowEnvironment=isolated-staging-qibh/);
assert.match(runner, /"inspect", uniqueDeploymentUrl\.origin, "--format=json"/);
assert.match(runner, /function fetchAuthoritativeVercelDeployment/);
assert.match(runner, /"api",\s*`\/v13\/deployments\/\$\{deploymentId\}`,\s*"--raw"/s);
assert.match(runner, /authoritative\.url !== uniqueDeploymentUrl\.hostname/);
assert.match(runner, /const projectId = authoritative\.projectId \?\? authoritative\.project\?\.id/);
assert.match(runner, /const metadata = authoritative\.meta \?\? authoritative\.metadata \?\? \{\}/);
assert.match(runner, /metadata\.dealflowCommit !== identity\.commit/);
assert.match(runner, /metadata\.dealflowTree !== identity\.tree/);
assert.match(runner, /currentMapping\?\.deploymentId !== deployment\.deploymentId/);
assert.match(runner, /currentMapping\?\.deploymentHost !== deployment\.deploymentHost/);
assert.match(runner, /record\.deployment\?\.id !== deploymentId/);
assert.match(runner, /`\/v4\/aliases\/\$\{encodeURIComponent\(aliasHost\)\}`/);
assert.match(runner, /predeploy-alias-authority\.json/);
assert.match(runner, /configuredBeforeDeployment: true/);
assert.match(runner, /verifiedUnchangedAfterDeployment: true/);
assert.match(runner, /read-only post-deployment isolated staging Vercel protection/);
assert.match(runner, /function configureAndProveAppAlias/);
assert.match(runner, /function proveAuthoritativePreDeployAliasOwnership/);
assert.match(runner, /failureContext\.stagingAliasMutations\.push\(rollbackRecord\)/);
assert.match(runner, /async function rollbackCreatedStagingAliasesAfterFailure/);
assert.match(runner, /const rollback = await runPinnedVercel\(/);
assert.match(runner, /authoritativePriorMappingRestored/);
assert.match(
  runner,
  /publicContainmentProvenSeparately: aliases\.every\(/,
);
assert.doesNotMatch(runner, /createdStagingAliases/);
const aliasConfigurationSource = runner.slice(
  runner.indexOf("async function configureAndProveAppAlias("),
  runner.indexOf("async function requestExactAppAlias("),
);
assert.ok(
  aliasConfigurationSource.indexOf("failureContext.stagingAliasMutations.push(rollbackRecord)") <
    aliasConfigurationSource.indexOf('"alias",\n      "set"'),
  "rollback intent must be registered before the alias mutation command",
);
const aliasRollbackSource = runner.slice(
  runner.indexOf("async function readExactAliasMappingDuringRollback("),
  runner.indexOf("let terminalFailurePromise = null"),
);
assert.match(aliasRollbackSource, /runPinnedVercel\(/);
assert.doesNotMatch(aliasRollbackSource, /spawnSync\(/);
assert.match(aliasRollbackSource, /record\.deployment\?\.id !== deploymentId/);
assert.match(aliasRollbackSource, /`\/v13\/deployments\/\$\{deploymentId\}`/);
assert.doesNotMatch(aliasRollbackSource, /configureHostedStagingProtection|--method|PATCH/);
assert.match(
  aliasRollbackSource,
  /timeoutMs = EXACT_ALIAS_PROPAGATION_TIMEOUT_MS/,
  "rollback authority reads must inherit the bounded edge-containment deadline",
);
assert.match(aliasRollbackSource, /timeoutMs,/);
assert.match(aliasRollbackSource, /timeoutMs: remainingMs/);
assert.match(aliasRollbackSource, /waitForExactAliasRollbackContainment\(\{/);
assert.match(aliasRollbackSource, /priorMappingPresent: mutation\.priorMapping !== null/);
assert.match(aliasRollbackSource, /allowDuringTermination: true/);
assert.match(aliasRollbackSource, /\{ timeoutMs \}/);
assert.match(aliasRollbackSource, /delay: cleanupDelay/);
assert.match(aliasRollbackSource, /PRODUCTION_OR_SHARED_HOSTS\.has\(mutation\.aliasHost\)/);
assert.match(
  aliasRollbackSource,
  /PRODUCTION_OR_SHARED_HOSTS\.has\(mutation\.priorMapping\.deploymentHost\)/,
);
assert.match(
  aliasRollbackSource,
  /PRODUCTION_OR_SHARED_HOSTS\.has\(intendedMapping\.deploymentHost\)/,
);
assert.match(aliasRollbackSource, /allRegisteredAliasesAttempted/);
assert.match(aliasRollbackSource, /cleanupContinuedAfterIndividualFailure: true/);
assert.match(aliasRollbackSource, /StagingAliasRollbackIncompleteError/);
assert.doesNotMatch(
  aliasRollbackSource,
  /const publicSurface = await requestExactAppAlias\(alias, \{\}, \{\s*allowDuringTermination: true/,
  "rollback must not make a one-shot stale-edge containment decision",
);
assert.match(runner, /"alias",\s*"set"/);
assert.match(runner, /dealflow-os-rebuild-selfserve-clean-partner-one-qibh\.vercel\.app/);
assert.match(runner, /dealflow-os-rebuild-selfserve-clean-partner-two-qibh\.vercel\.app/);
assert.match(browserSpec, /dealflow-os-rebuild-selfserve-clean-partner-one-qibh\.vercel\.app/);
assert.match(browserSpec, /dealflow-os-rebuild-selfserve-clean-partner-two-qibh\.vercel\.app/);
assert.match(browserConfig, /dealflow-os-rebuild-selfserve-clean-partner-one-qibh\.vercel\.app/);
assert.match(browserConfig, /dealflow-os-rebuild-selfserve-clean-partner-two-qibh\.vercel\.app/);
assert.match(runner, /staging app alias does not target the exact candidate deployment/);

assert.equal(
  (runner.match(/runSeed\(partnerOneAlias\.aliasUrl, secondPartnerAlias\.aliasUrl\)/g) ?? []).length,
  2,
);
assert.match(runner, /function proveClosedPreDeployAppAliasSurface/);
assert.match(runner, /function provePostDeployAppAliasGate/);
assert.match(runner, /function proveUniqueDeploymentProtectionRedirect/);
assert.match(runner, /function provePostDeployStaticAssetGate/);
assert.match(runner, /findExactNextStaticChunkPath/);
assert.match(runner, /STAGING_PRIVATE_IMAGE_SOURCE_PATH/);
assert.match(runner, /staging-private-image-gate-proof-v2\//);
assert.match(runner, /`\$\{STAGING_PRIVATE_IMAGE_SOURCE_PATH_PREFIX\}\$\{identity\.commit\}\.png`/);
assert.match(runner, /function buildVersionedPrivateImagePaths/);
assert.match(runner, /optimizer\.searchParams\.set\("url", sourceResourcePath\)/);
assert.match(runner, /DISABLED_STAGING_IMAGE_OPTIMIZER_PATH/);
assert.match(runner, /VERCEL_NATIVE_IMAGE_OPTIMIZER_PATH = "\/_vercel\/image"/);
assert.match(runner, /function isExactDealFlowApplicationGateResponse/);
assert.match(runner, /classifyExactNextImageOptimizerRejection/);
assert.match(runner, /assertExactNextImageOptimizerSixModeMatrix/);
assert.match(runner, /function proveExactProviderOptimizerMatrices/);
assert.match(runner, /bothProviderPathsClassifiedIdentically: true/);
assert.match(
  runner,
  /enumeratedDealFlowOptimizerSourcePortfolioClosedForManifestBoundCandidate: true/,
);
assert.match(runner, /hostedOutputInventoryExhaustivenessClaimed: false/);
assert.match(runner, /assertExactCandidateDeployedImagePortfolioConfiguration/);
assert.match(runner, /authoritative\.images/);
assert.match(runner, /hostedExactCandidateEnumeratedImagePortfolioProof/);
assert.match(runner, /hosted-exact-candidate-image-portfolio\.json/);
assert.match(runner, /hosted-exact-candidate-image-portfolio-failure\.json/);
assert.match(runner, /summarizeDeployedImageConfiguration/);
assert.match(runner, /rawDeploymentMetadataPersisted !== false/);
assert.match(runner, /deploymentIdPersistedInThisProof !== false/);
assert.match(runner, /projectIdPersistedInThisProof !== false/);
assert.ok(
  deployedImageConfigContract.includes(
    '"^(?:\\\\/_next\\\\/static\\\\/media',
  ),
  "deployed image config must pin the exact compiled static-media regex",
);
assert.match(deployedImageConfigContract, /remotePatterns\.length !== 0/);
assert.match(deployedImageConfigContract, /domains\.length !== 0/);
assert.match(deployedImageConfigContract, /optimizerEligibleStaticMediaAssetCount !== 0/);
assert.match(deployedImageConfigContract, /JSON\.stringify\(qualities\).*\[75\]/s);
assert.match(deployedImageConfigContract, /EXACT_IMAGE_SIZES/);
assert.match(deployedImageConfigContract, /images\.minimumCacheTTL !== 14_400/);
assert.match(deployedImageConfigContract, /\["image\/webp"\]/);
assert.match(deployedImageConfigContract, /script-src 'none'; frame-src 'none'; sandbox;/);
assert.match(deployedImageConfigContract, /images\.contentDispositionType !== "attachment"/);
assert.match(deployedImageConfigContract, /rawValuesPersisted: false/);
assert.match(deployedImageConfigContract, /unrecognizedKeys\.length !== 0/);
assert.match(
  deployedImageConfigContract,
  /authoritativeHostedOutputInventoryProven: false/,
);
assert.match(
  deployedImageConfigContract,
  /compiledConfigurationCompatibleWithEnumeratedPortfolioClosure: true/,
);
for (const deployedConfigNegative of [
  "absent config",
  "remote pattern",
  "legacy domain",
  "missing compiled local pattern",
  "broad local pattern",
  "extra local pattern",
  "eligible static media",
  "wrong quality",
  "missing probe width",
  "duplicate width",
  "SVG enabled",
  "wrong cache TTL",
  "wrong format",
  "wrong CSP",
  "inline disposition",
  "unexpected path",
  "unexpected loader",
  "unrecognized authority key",
]) {
  assert.ok(
    deployedImageConfigContractTest.includes(`["${deployedConfigNegative}"`),
    `missing deployed image configuration negative case: ${deployedConfigNegative}`,
  );
}
assert.match(
  deployedImageConfigContractTest,
  /sourceNextConfigLocalPatternsDenyAll: false/,
);
assert.match(
  deployedImageConfigContractTest,
  /sourceNextConfigRemotePatternsDenyAll: false/,
);
assert.match(
  imageOptimizerResponseContract,
  /VERCEL_IMAGE_OPTIMIZER_ERROR_CODE =\s*"INVALID_IMAGE_OPTIMIZE_REQUEST"/,
);
assert.match(
  imageOptimizerResponseContract,
  /181453757443407acf6ee0919e1a19c891d852a9d505bd40c95c3b9029eee2cf/,
);
assert.match(
  imageOptimizerResponseContract,
  /77766dbf7dfbed83e26d498b516cde4d31dffb22a1374568bbbb2d9eeb094202/,
);
assert.match(imageOptimizerResponseContract, /bodyBuffer\.length === 84/);
assert.match(imageOptimizerResponseContract, /\^\(\[a-z\]\{3\}\\d\)::\(\[A-Za-z0-9_-\]\{32\}\)\$/);
assert.match(imageOptimizerResponseContract, /rawBodyPersisted: false/);
assert.match(imageOptimizerResponseContract, /rawBodySha256Persisted: false/);
assert.match(
  imageOptimizerResponseContract,
  /result\.rawBodySha256Persisted !== false/,
);
assert.match(imageOptimizerResponseContract, /rawRequestIdPersisted: false/);
assert.match(imageOptimizerResponseContract, /rawVercelErrorPersisted: false/);
assert.match(
  imageOptimizerResponseContract,
  /dispositions\[0\] !== "EXACT_VERCEL_EDGE_IMAGE_OPTIMIZER_REJECTION"/,
);
assert.match(
  imageOptimizerResponseContractTest,
  /rawBodySha256Persisted: true/,
);
for (const negativeLabel of [
  "status",
  "content type",
  "cache",
  "redirect",
  "URL",
  "location",
  "error header",
  "missing error header",
  "generic 400",
  "wrong body template",
  "wrong body code",
  "wrong region case",
  "wrong region length",
  "short opaque ID",
  "long opaque ID",
  "unsafe opaque alphabet",
  "extra trailing byte",
  "non-UTF8 body",
]) {
  assert.ok(
    imageOptimizerResponseContractTest.includes(`["${negativeLabel}"`),
    `missing strict optimizer negative case: ${negativeLabel}`,
  );
}
assert.match(runner, /defaultOptimizerOwnedByVercelEdge: true/);
assert.match(runner, /defaultOptimizerApplicationProxyClaimed: false/);
assert.match(runner, /vercelNativeOptimizerOwnedByVercelEdge: true/);
assert.match(runner, /vercelNativeOptimizerApplicationProxyClaimed: false/);
assert.match(runner, /EXACT_VERCEL_EDGE_IMAGE_OPTIMIZER_REJECTION/);
assert.doesNotMatch(runner, /EXACT_LOCAL_NEXT_IMAGE_OPTIMIZER_REJECTION/);
assert.match(runner, /proveApprovedDirectPublicImageMatrix/);
assert.match(runner, /EXACT_HOSTED_DIRECT_PUBLIC_IMAGE_CONTENT_TYPE_BY_IDENTITY/);
assert.match(runner, /"image\/vnd\.microsoft\.icon"/);
assert.match(runner, /sourceInventoryContentType: asset\.contentType/);
assert.match(runner, /hostedContentType: hostedExpectation\.contentType/);
assert.match(runner, /evaluateApprovedDirectPublicImageSixModeMatrix/);
assert.match(runner, /buildApprovedDirectPublicImageMatrixCheckpoint/);
assert.match(runner, /writeAtomicApprovedDirectPublicImageMatrixCheckpoint/);
assert.match(runner, /checkpointEvaluation\.matrixStatus !== "PASS"/);
assert.match(runner, /checkpointAtomicallyPersistedBeforeEachMatrixAssertion: true/);
assert.match(runner, /localSourceInventoryAndHostedMimeContractsDistinguished: true/);
assert.match(
  approvedDirectImageCheckpointContract,
  /renameSync\(temporaryPath, path\)[\s\S]{0,240}fsyncSync\(parentDescriptor\)/,
);
assert.match(approvedDirectImageCheckpointContract, /observedBodySha256Persisted: false/);
assert.doesNotMatch(
  approvedDirectImageCheckpointContract,
  /response:\s*Object\.freeze\([\s\S]{0,220}bodySha256:/,
);
assert.match(
  approvedDirectImageCheckpointContractTest,
  /EXPECTED_MODE_PREDICATE_NEGATIVE_COUNT = 42/,
);
assert.match(approvedDirectImageCheckpointContractTest, /OBSERVED_MUTATION_HASH/);
assert.match(approvedDirectImageCheckpointContractTest, /firstFailure/);
assert.match(approvedDirectImageCheckpointContractTest, /secondDigest, firstDigest/);
assert.match(runner, /sanitizedFailureDescriptorSha256: sha256\(sanitizedMessage\)/);
assert.match(runner, /approvedDirectPublicImageMatrixCheckpointFiles/);
assert.match(runner, /assertExactApprovedDirectPublicImageMatrixCheckpoint\(checkpoint\)/);
assert.match(runner, /failedApprovedDirectPublicImageMatrixCheckpointCount/);
assert.match(
  runner,
  /approvedDirectPublicImageFailureMetadataRetainedByFailedCheckpoint:/,
);
assert.doesNotMatch(
  runner,
  /approvedDirectPublicImageFailureMetadataRetainedByCheckpoint:/,
);
assert.match(
  runner,
  /assetOrdinal=\$\{exactFailure\.assetOrdinal\} mode=\$\{exactFailure\.mode\} failedPredicates=\$\{exactFailure\.failedPredicates\.join\(","\)\}/,
);
assert.doesNotMatch(
  runner,
  /throw new Error\(`\$\{alias\.label\} approved direct public image gate matrix failed`\);/,
);
assert.match(runner, /proveDynamicImageSourceMatrix/);
assert.match(runner, /privateImageForbiddenQueryRejected: true/);
assert.match(runner, /forbiddenQueryWithValidHeader/);
assert.match(runner, /assertExactStagingImageBuildInputInventory/);
assert.match(imageBuildInputContract, /optimizerEligibleStaticMediaAssetCount: 0/);
assert.match(imageBuildInputContract, /"\/_vercel\/image"/);
assert.match(imageBuildInputContract, /staticallyConcatenatedText/);
assert.match(imageBuildInputContract, /containsForbiddenOptimizerResourcePath/);
assert.match(imageBuildInputContract, /next\/legacy\/image/);
assert.match(imageBuildInputContract, /next\/future\/image/);
assert.match(imageBuildInputContract, /aliases or calls its Next Image binding/);
assert.match(imageBuildInputContract, /Dynamic image-producing route inventory is not exact/);
assert.match(imageBuildInputContract, /Deployable image assets are not the exact approved public direct-asset portfolio/);
for (const forbiddenVercelConstruction of [
  '"/_vercel/image?url=%2Flogo.svg&w=32&q=75"',
  "const endpoint = \\`/_vercel/image?url=",
  '"/_vercel/" + "image?url=%2Flogo.svg&w=32&q=75"',
  'srcSet="/_vercel/image?url=%2Flogo.svg&w=32&q=75 1x"',
  'imageSrcSet="/_vercel/image?url=%2Flogo.svg&w=32&q=75 1x"',
  "url('/_vercel/image?url=%2Flogo.svg&w=32&q=75')",
]) {
  assert.ok(
    stagingAccessGateContractTest.includes(forbiddenVercelConstruction),
    `missing forbidden Vercel optimizer construction fixture: ${forbiddenVercelConstruction}`,
  );
}
assert.match(runner, /cachedPriorProofPathUsed: false/);
assert.match(runner, /privateImageProofVersion: 2/);
assert.match(runner, /currentVersionedProofIntentionalPublicResourceCountPerAlias: 0/);
assert.match(runner, /historicalLegacyOptimizerArtifactAcceptedAsCurrentProof: false/);
assert.match(runner, /retiredSourceOptimizerFullSixModeMatrix: true/);
assert.match(runner, /retiredPublicSourceStatusAllCredentialModes: 404/);
assert.match(runner, /postWarmUnauthorizedSourceAndChunkRecheck: true/);
assert.match(runner, /invalidHeaderAfterWarm/);
assert.match(runner, /invalidCookieAfterWarm/);
assert.match(browserSpec, /imageFailures/);
assert.match(browserSpec, /response\.request\(\)\.resourceType\(\) === "image"/);
assert.match(browserSpec, /naturalWidth/);
assert.match(browserSpec, /assertDirectImageLoaded/);
assert.match(browserSpec, /optimizerNetworkRequests/);
assert.match(browserSpec, /optimizerDomSources/);
assert.match(browserSpec, /optimizerPerformanceEntries/);
assert.match(browserSpec, /performance\s*\.getEntriesByType\("resource"\)/);
assert.match(browserSpec, /scanOptimizerBrowserSurfaces/);
assert.match(browserSpec, /root\.querySelectorAll\("img, source, link"\)/);
assert.match(browserSpec, /element\.currentSrc/);
assert.match(browserSpec, /element\.getAttribute\("src"\)/);
assert.match(browserSpec, /element\.srcset/);
assert.match(browserSpec, /element\.getAttribute\("srcset"\)/);
assert.match(browserSpec, /element instanceof HTMLSourceElement/);
assert.match(browserSpec, /element instanceof HTMLLinkElement/);
assert.match(browserSpec, /element\.relList\.contains\("preload"\)/);
assert.match(browserSpec, /element\.getAttribute\("href"\)/);
assert.match(browserSpec, /element\.imageSrcset/);
assert.match(browserSpec, /element\.getAttribute\("imagesrcset"\)/);
assert.match(browserSpec, /decodeURIComponent/);
assert.match(browserSpec, /rawUrlsOrQueriesPersisted: false/);
assert.match(
  browserSpec,
  /optimizer DOM scanner detects every dormant responsive and preload surface without network use/,
);
assert.match(browserSpec, /detachedFixtureMarkup/);
assert.match(browserSpec, /detachedCurrentSrcOverrides/);
assert.match(browserSpec, /fixtureNetworkRequestCount/);
assert.match(browserSpec, /forbiddenRawEvidence/);
assert.match(browserSpec, /"\/_next\/image"/);
assert.match(browserSpec, /"\/_vercel\/image"/);
assert.match(browserSpec, /_dealflow-staging-image-optimizer-disabled/);
assert.match(runner, /postdeploy-static-asset-gate\.json/);
assert.match(
  runner,
  /provePostDeployStaticAssetGate\(\s*aliasAccessRequirements,\s*identity,\s*deployment\.hostedExactCandidateEnumeratedImagePortfolioProof,\s*\)/,
);
assert.match(
  runner,
  /protectionRedirect = classifyExactVercelAutomationProtectionRedirect\(\{/,
);
assert.match(runner, /protectionLocation: protectionRedirect\.locationOriginPath/);
assert.doesNotMatch(runner, /const uniqueReady = await waitForDeployment/);
assert.doesNotMatch(
  runner,
  /proveHostedBuildReleaseIdentity\(\s*identity,\s*deployment\.deploymentUrl/,
);
assert.match(
  runner,
  /HOSTED_RELEASE_IDENTITY_SCHEMA = "dealflow\.hosted-release-identity\.v2"/,
);
assert.match(
  runner,
  /JSON\.stringify\(\["buildSource", "ok", "release", "schemaVersion"\]\)/,
);
assert.match(runner, /buildSource: payload\.buildSource/);
assert.match(runner, /assertExactHostedBuildSourceIdentity/);
assert.match(
  runner,
  /buildGeneratedIdentityTransport: "authenticated_release_identity_payload"/,
);
assert.match(runner, /buildSourceEmbeddedInReleaseIdentityResponse: true/);
assert.match(runner, /buildGeneratedIdentityEndpointPath: endpoint\.pathname/);
for (const stage of [
  "stable_alias_configuration",
  "stable_alias_edge_propagation",
  "stable_alias_application_gate_verification",
  "stable_alias_build_identity_verification",
  "partner_one_alias_configuration",
  "partner_one_alias_edge_propagation",
  "partner_one_application_gate_verification",
  "partner_one_build_identity_verification",
  "partner_two_alias_configuration",
  "partner_two_alias_edge_propagation",
  "partner_two_application_gate_verification",
  "partner_two_build_identity_verification",
  "stable_alias_readiness",
  "partner_one_alias_readiness",
  "partner_two_alias_readiness",
  "postdeployment_application_alias_gate_verification",
  "postdeployment_static_asset_gate_verification",
]) {
  assert.match(
    runner,
    new RegExp(`failureContext\\.stage = "${stage}"`),
    `missing exact hosted acceptance failure stage ${stage}`,
  );
}
assert.doesNotMatch(
  runner,
  /new URL\(\s*"\/\.well-known\/dealflow-hosted-build-identity\.json"/,
  "hosted source proof must use the authenticated release-identity response, not a public static artifact fetch",
);
assert.match(runner, /assertSeedReplayIsIdempotent\(seedOne, seedTwo\)/);
assert.match(runner, /function classifyExactSyntheticRetentionAuthorityReplay/);
assert.match(runner, /fresh_pending_then_approved/);
assert.match(runner, /resumed_exact_synthetic_approval/);
assert.match(runner, /approvedAt !== SYNTHETIC_FIXTURE_TIMESTAMP/);
assert.match(runner, /retentionAuthorityReplayMode/);
const seedReplayBody = /function assertSeedReplayIsIdempotent\(first, second\) \{([\s\S]*?)\n\}/.exec(runner)?.[1];
assert.ok(seedReplayBody, "seed replay contract must remain statically inspectable");
assert.doesNotMatch(seedReplayBody, /pendingBeforeApproval !== true/);
assert.doesNotMatch(seedReplayBody, /rejectedWhilePending !== true/);
assert.match(seedReplayBody, /classifyExactSyntheticRetentionAuthorityReplay\(first, second\)/);
assert.match(seed, /admin\.rpc\("bind_verified_partner_attribution_v1"/);
assert.doesNotMatch(seed, /upsert\(admin, "workspace_partner_attribution"/);
assert.match(seedContract, /attributionBoundAtomically: true/);
assert.match(runner, /closesHostedDeferrals: \["npm run rls:cross-tenant", "npm run rls:fixture-smoke"\]/);
assert.match(runner, /\["run", "rls:cross-tenant"\]/);
assert.match(runner, /\["run", "rls:fixture-smoke"\]/);
assert.match(runner, /exactZeroResidue/);
assert.match(runner, /\["run", "operator:debt"\]/);
assert.match(rlsFixtureSmoke, /cleanupStaleRlsFixtures\(admin\)/);
assert.match(rlsFixtureSmoke, /createTenantFixtures\(admin, "a", fixtures, identityA\)/);
assert.match(rlsFixtureSmoke, /loadCanonicalTenant/);
assert.match(rlsFixtureSmoke, /validatePreauthenticatedJwt/);
assert.match(rlsFixtureSmoke, /anon\.auth\.getUser\(jwt\)/);
assert.match(rlsFixtureSmoke, /requireEnv\("RLS_USER_A_JWT"\)/);
assert.match(rlsFixtureSmoke, /requireEnv\("RLS_USER_B_JWT"\)/);
for (const rlsSource of [rlsFixtureSmoke, rlsCrossTenant]) {
  assert.match(rlsSource, /IS_ISOLATED_STAGING_PROOF/);
  assert.match(rlsSource, /EXPECTED_STAGING_PROJECT_FINGERPRINT/);
  assert.match(rlsSource, /projectRef\?\.endsWith\("qibh"\)/);
  assert.match(rlsSource, /if \(!IS_ISOLATED_STAGING_PROOF\) \{[\s\S]*?loadEnvConfig/);
}
assert.match(runner, /DEALFLOW_DEPLOYMENT_TARGET: "staging"/);
assert.doesNotMatch(rlsFixtureSmoke, /generateLink|verifyOtp|signInWithPassword/);
assert.match(rlsFixtureSmoke, /create_campaign_plan_with_entitlement_v1/);
assert.match(rlsFixtureSmoke, /fixtures\.campaignIds\.push\(campaignId\)/);
assert.match(rlsFixtureSmoke, /campaign entitlement authority returned an invalid tenant binding/);
assert.match(rlsFixtureSmoke, /\["organization_memberships", "organization_id", fixtures\.orgIds\]/);
assert.match(rlsFixtureSmoke, /const failures = \[\]/);
assert.match(rlsFixtureSmoke, /cleanup attempted every tracked resource/);
assert.match(rlsFixtureSmoke, /platform: "meta_ads"/);
assert.match(rlsFixtureSmoke, /RLS_CANONICAL_CREDIT_A_USER_ID/);
assert.match(rlsFixtureSmoke, /RLS_CANONICAL_CREDIT_B_USER_ID/);
assert.match(rlsFixtureSmoke, /RLS_CANONICAL_CREDIT_A_LEDGER_ID/);
assert.match(rlsFixtureSmoke, /RLS_CANONICAL_CREDIT_B_LEDGER_ID/);
assert.match(rlsFixtureSmoke, /RLS_CANONICAL_ORGANIZATION_A_ID/);
assert.match(rlsFixtureSmoke, /RLS_CANONICAL_ORGANIZATION_B_ID/);
assert.match(rlsFixtureSmoke, /RLS_CANONICAL_BILLING_A_ID/);
assert.match(rlsFixtureSmoke, /RLS_CANONICAL_STRIPE_EVENT_A_ID/);
assert.match(rlsFixtureSmoke, /RLS_CANONICAL_STRIPE_EVENT_B_ID/);
assert.match(rlsFixtureSmoke, /RLS_CANONICAL_PROVIDER_LIMIT_A_ID/);
assert.match(rlsFixtureSmoke, /RLS_CANONICAL_PROVIDER_LIMIT_B_ID/);
assert.match(rlsFixtureSmoke, /RLS_CANONICAL_PROVIDER_EVENT_A_ID/);
assert.match(rlsFixtureSmoke, /RLS_CANONICAL_PROVIDER_EVENT_B_ID/);
assert.match(runner, /RLS_CANONICAL_CREDIT_A_USER_ID: seedOne\.rlsCreditFixtures\.userAId/);
assert.match(runner, /RLS_CANONICAL_CREDIT_B_USER_ID: seedOne\.rlsCreditFixtures\.userBId/);
assert.match(runner, /RLS_CANONICAL_CREDIT_A_LEDGER_ID: seedOne\.rlsCreditFixtures\.ledgerAId/);
assert.match(runner, /RLS_CANONICAL_CREDIT_B_LEDGER_ID: seedOne\.rlsCreditFixtures\.ledgerBId/);
assert.match(runner, /RLS_CANONICAL_ORGANIZATION_A_ID: seedOne\.rlsCreditFixtures\.organizationAId/);
assert.match(runner, /RLS_CANONICAL_ORGANIZATION_B_ID: seedOne\.rlsCreditFixtures\.organizationBId/);
assert.match(runner, /RLS_CANONICAL_BILLING_A_ID: seedOne\.rlsCreditFixtures\.billingAId/);
assert.match(runner, /RLS_CANONICAL_STRIPE_EVENT_A_ID: seedOne\.rlsCreditFixtures\.stripeEventAId/);
assert.match(runner, /RLS_CANONICAL_PROVIDER_LIMIT_A_ID: seedOne\.rlsCreditFixtures\.providerUsageLimitAId/);
assert.match(runner, /RLS_CANONICAL_PROVIDER_EVENT_A_ID: seedOne\.rlsCreditFixtures\.providerUsageEventAId/);
assert.match(runner, /JSON\.stringify\(first\.rlsCreditFixtures\) !== JSON\.stringify\(second\.rlsCreditFixtures\)/);
assert.match(runner, /Authenticated isolated-staging RLS proofs did not close with exact zero residue/);
assert.match(runner, /async function resetIsolatedStagingRateLimits\(admin, phase\)/);
assert.match(runner, /before_provider_independent_journeys/);
assert.match(runner, /after_provider_independent_journeys/);
assert.match(runner, /isolated-staging-rate-limit-reset\.json/);
assert.match(runner, /normalRateLimitImplementationChanged: false/);
assert.match(runner, /RLS_FIXTURE_DIRECT_MARKERS/);
assert.match(runner, /RLS_FIXTURE_LEGACY_IMMUTABLE_MARKERS/);
assert.match(runner, /isRlsFixtureAuthEmail/);
assert.match(
  runner,
  /\.from\(marker\.table\)\s*\.select\(marker\.column, \{ count: "exact", head: true \}\)/,
  "RLS residue proof must project each marker's known-existing column",
);
assert.doesNotMatch(
  runner,
  /\.from\(marker\.table\)\.select\("id", \{ count: "exact", head: true \}\)/,
  "RLS residue proof must not assume every marker table has an id column",
);
assert.match(rlsFixtureSmoke, /RLS_FIXTURE_DIRECT_MARKERS/);
assert.match(rlsFixtureSmoke, /RLS proof failed and fixture cleanup also failed/);
assert.match(rlsFixtureContract, /leadMessages/);
assert.match(rlsFixtureContract, /marketingAccounts/);
assert.match(rlsFixtureContract, /creativeAssets/);
assert.match(rlsFixtureContract, /billingSubscriptions/);
assert.match(rlsFixtureContract, /metaLaunchLocks/);
assert.match(rlsFixtureContract, /legacyStripeWebhookEvents/);
assert.match(rlsCrossTenant, /table: "organization_user_credits"/);
assert.match(rlsCrossTenant, /Legacy user credits: User A denied from frozen table/);
assert.doesNotMatch(
  rlsFixtureSmoke,
  /insertOne\(admin, "campaign_plans"/,
  "hosted RLS proof must respect the canonical campaign entitlement authority",
);
assert.doesNotMatch(rlsFixtureSmoke, /insertOne\(admin, "stripe_webhook_events"/);
assert.doesNotMatch(rlsFixtureSmoke, /insertOne\(admin, "provider_usage_(?:events|limits)"/);
assert.doesNotMatch(rlsFixtureSmoke, /\["stripe_webhook_events",/);
assert.doesNotMatch(rlsFixtureSmoke, /\["provider_usage_(?:events|limits)",/);

const loadBody =
  /async function runHostedLoadProof\(baseUrl, vercelAutomationBypassRequired\) \{([\s\S]*?)\n\}/.exec(
    runner,
  )?.[1];
assert.ok(loadBody, "hosted load proof must remain statically inspectable");
assert.match(loadBody, /methods: \["GET"\]/);
assert.match(loadBody, /leadCapturePostAttempted: false/);
assert.doesNotMatch(loadBody, /method:\s*"POST"/);
assert.doesNotMatch(loadBody, /\/api\/lead-capture/);
assert.match(runner, /JSON\.stringify\(countsBefore\) !== JSON\.stringify\(countsAfter\)/);

assert.match(browserConfig, /retries: 0/);
assert.match(browserConfig, /forbidOnly: true/);
assert.doesNotMatch(runner, /--reporter=json/);
assert.match(runner, /configuredJsonReporter: true/);
assert.match(runner, /configuredJunitReporter: true/);
assert.match(runner, /configuredHtmlReporter: true/);
assert.match(runner, /safe-browser-acceptance-summary\.json/);
for (const project of ["desktop-chromium", "mobile-chromium", "desktop-firefox", "desktop-webkit"]) {
  assert.match(browserConfig, new RegExp(`name: "${project}"`));
}
assert.doesNotMatch(browserSpec, /test\.(?:skip|fixme)\s*\(/);
assert.equal((browserSpec.match(/^test\("/gm) ?? []).length, 15);
assert.match(
  runner,
  /const expectedProjectTestCount = config === "playwright\.staging\.config\.ts"\s*\? 15\s*:\s*14/,
);
for (const role of [
  "newDirect",
  "paidDirect",
  "legacy",
  "partnerAdmin",
  "partnerChild",
  "partnerAdminTwo",
  "partnerChildTwo",
  "operator",
  "attacker",
  "deletion",
]) {
  assert.match(browserSessionContract, new RegExp(`${role}:`));
}
assert.equal((browserSpec.match(/await credentialSignIn\(/g) ?? []).length, 1);
assert.equal((browserSpec.match(/await openAuthenticatedSession\(/g) ?? []).length, 11);
assert.deepEqual(
  [...new Set(
    [...browserSpec.matchAll(/await openAuthenticatedSession\(\s*page,\s*"([A-Za-z]+)"/g)]
      .map((match) => match[1]),
  )].sort(),
  [
    "attacker",
    "deletion",
    "legacy",
    "operator",
    "paidDirect",
    "partnerAdmin",
    "partnerAdminTwo",
    "partnerChild",
    "partnerChildTwo",
  ].sort(),
  "every non-password synthetic role must be exercised by the browser suite",
);
assert.match(browserSpec, /credentialSignIn\(page, ROLE_EMAILS\.newDirect/);
assert.match(browserSpec, /const authForm = page\.locator\("form"\)/);
assert.match(browserSpec, /authForm\.getByRole\("button", \{ name: "Sign in", exact: true \}\)\.click\(\)/);
assert.match(browserSpec, /const authSubmit = page\.locator\("form"\)\.getByRole\("button", \{/);
assert.doesNotMatch(browserSpec, /page\.getByRole\("button", \{ name: \/sign in\/i \}\)\.click\(\)/);
assert.match(browserSpec, /browserCookiesForOrigin\(session/);
assert.doesNotMatch(browserSpec, /localStorage\.setItem\([^\n]*auth-token/);
assert.match(browserSessionContract, /3_180/);
assert.match(browserSessionContract, /cookie chunks are not contiguous from zero/);
assert.match(browserSessionContract, /official base64url SSR data/);
assert.match(browserSessionContract, /challenges\.cloudflare\.com/);
assert.match(browserSessionContract, /url\.origin !== "https:\/\/challenges\.cloudflare\.com"/);
assert.match(browserSessionContract, /url\.username !== ""/);
assert.match(browserSessionContract, /\/turnstile\/v0\/api\.js/);
assert.match(browserSessionContract, /\/cdn-cgi\/challenge-platform\//);
assert.match(browserSpec, /public funnel renders the official staging Turnstile test widget/);
assert.match(safeBrowserSpec, /establishQaSession/);
assert.match(safeBrowserSpec, /establishQaHarnessSession/);
assert.match(safeBrowserSpec, /restricted QA harness creates a masked non-admin session/);
assert.match(safeBrowserSpec, /clearExactQaAuthCookies/);
assert.match(safeBrowserSpec, /QA harness proof must begin unauthenticated/);
assert.match(safeBrowserSpec, /page\.request\.fetch\(target\.toString\(\), \{/);
const safeMutationDispositionSource = safeBrowserSpec.slice(
  safeBrowserSpec.indexOf("function mutationDisposition("),
  safeBrowserSpec.indexOf("async function installSafetyHarness("),
);
assert.doesNotMatch(safeMutationDispositionSource, /qa_session|qa-auth-session/);
assert.doesNotMatch(
  safeBrowserSpec,
  /page\.request\.(?:post|put|patch|delete)\s*\(/i,
  "safe browser mutations must pass through the page route firewall",
);
assert.match(safeBrowserSpec, /sha256\(qaProjectRef \?\? ""\)/);
assert.match(safeBrowserSpec, /EXPECTED_STAGING_PROJECT_FINGERPRINT/);
assert.match(safeBrowserSpec, /safeHttpEvidenceTarget\(request\.url\(\)\)/);
assert.match(browserContextBoundary, /export function safeHttpEvidenceTarget/);
assert.match(browserContextBoundaryTest, /user:secret@forbidden\.example/);
assert.match(globalSafetyPreflight, /sha256\(projectRef\) !== EXPECTED_STAGING_PROJECT_FINGERPRINT/);
assert.doesNotMatch(safeBrowserSpec, /establishPreauthenticatedPaidSession/);
assert.match(browserSpec, /sha256\(projectRef\).*EXPECTED_SUPABASE_FINGERPRINT/s);
assert.match(browserSpec, /url\.origin === `https:\/\/\$\{exactProjectRef\}\.supabase\.co`/);
assert.match(browserSpec, /activeApplicationOrigin/);
assert.match(browserSpec, /url\.pathname === "\/auth\/v1\/user"/);
assert.match(browserSpec, /url\.searchParams\.get\("grant_type"\) === "password"/);
assert.doesNotMatch(browserSpec, /url\.pathname\.startsWith\("\/auth\/v1\/"\)/);
assert.match(browserSpec, /blockedMutations/);
assert.match(browserSpec, /forbiddenHosts/);
assert.match(safeBrowserSpec, /forbiddenHosts/);
assert.match(safeBrowserSpec, /requestUrl\.pathname === "\/auth\/v1\/user"/);
assert.doesNotMatch(safeBrowserSpec, /requestUrl\.pathname\.startsWith\("\/auth\/v1\/"\)/);
assert.match(safeBrowserSpec, /assertExactHostedSafeBrowserOrigin\(BASE_URL\)/);
assert.match(globalSafetyPreflight, /assertExactHostedSafeBrowserOrigin\(baseUrl\.toString\(\)\)/);
assert.match(safeBrowserConfig, /assertExactHostedSafeBrowserOrigin\(configuredBaseUrl\)/);
assert.match(
  safeBrowserHostContract,
  /https:\/\/dealflow-os-rebuild-selfserve-clean\.vercel\.app/,
);
assert.match(safeBrowserHostContract, /url\.origin !== EXPECTED_HOSTED_SAFE_BROWSER_ORIGIN/);
assert.match(safeBrowserHostTest, /\.vercel\.app:444/);
assert.match(safeBrowserHostTest, /evil\.example\.com/);
assert.match(browserSpec, /LOCALIZED_PRODUCT_COPY/);
assert.match(browserSpec, /EN FR ES public product routes/);
assert.match(browserSpec, /paid realtor can use authenticated EN FR ES dashboards/);
assert.match(browserSpec, /emulateMedia\(\{ reducedMotion: "reduce" \}\)/);
assert.match(browserSpec, /document\.documentElement\.style\.zoom = "2"/);
assert.match(browserSpec, /first keyboard target must retain a visible focus outline/);
assert.match(browserSpec, /Confirmed state is stale/);
assert.match(browserSpec, /Showing last confirmed Meta data/);
assert.match(browserSpec, /PARTNER_TWO_CAMPAIGN_ID/);
assert.match(browserSpec, /STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL/);
assert.match(browserSpec, /account-deletion realtor is suspended from product and API access/);
assert.match(browserSpec, /account_deletion_workspace_suspended/);

assert.match(runner, /runProviderIndependentStagingProof/);
assert.match(runner, /provider-independent-journeys\.json/);
assert.match(runner, /parsed\.worker\?\.deadLetterReviewed !== true/);
assert.match(runner, /parsed\.worker\?\.providerTableStateUnchanged !== true/);
assert.match(runner, /parsed\.accountDeletion\?\.fullProviderOffboardingPerformed !== false/);
assert.match(runner, /parsed\.externalProviderAcceptance\?\.meta !== "BLOCKED_CREDENTIAL_AND_PROVIDER_AUTHORITY"/);
assert.match(providerIndependentProof, /apply_billing_subscription_webhook/);
assert.match(providerIndependentProof, /evt_test_df_staging_lifecycle_cancel/);
assert.match(providerIndependentProof, /stale_event/);
assert.match(providerIndependentProof, /replay_projection_repaired/);
assert.match(providerIndependentProof, /\/api\/lead-capture/);
assert.match(providerIndependentProof, /duplicateReplaySameIdentity: true/);
assert.match(providerIndependentProof, /create_support_ticket_with_outbox/);
assert.match(providerIndependentProof, /internal_operator_inbox/);
assert.match(providerIndependentProof, /\/api\/internal\/system-jobs/);
assert.match(providerIndependentProof, /crashedLeaseRecovered: true/);
assert.match(providerIndependentProof, /deadLetterPreserved: true/);
assert.match(providerIndependentProof, /deadLetterReviewed: true/);
assert.match(providerIndependentProof, /captureTableState/);
assert.match(providerIndependentProof, /providerTableStateUnchanged: true/);
assert.match(providerIndependentProof, /failedRefreshPreservedLastConfirmed: true/);
assert.match(providerIndependentProof, /crossPartnerCampaignDenied: true/);
assert.match(providerIndependentProof, /reusedRoleCount: 3/);
assert.match(providerIndependentProof, /passwordSignInCount: 0/);
assert.match(providerIndependentProof, /rawTokenPersisted: false/);
assert.match(providerIndependentProof, /create_account_deletion_request_v1/);
assert.match(providerIndependentProof, /authority\.grace_days !== 0/);
assert.match(providerIndependentProof, /authority\.financial_retention_days !== 365/);
assert.match(providerIndependentProof, /authority\.policy_version !== 2/);
assert.match(providerIndependentProof, /retention_policy\?\.operationalRetentionDays !== 1/);
assert.match(providerIndependentProof, /retention_policy\?\.financialRetentionDays !== 365/);
assert.match(providerIndependentProof, /retention_policy\?\.policyVersion !== 2/);
assert.match(providerIndependentProof, /account_deletion_execution_disabled/);
assert.match(providerIndependentProof, /providerReceiptCount: 0/);
assert.match(providerIndependentProof, /fullProviderOffboardingPerformed: false/);
for (const providerName of ["meta", "ghl", "higgsfield", "twilio"]) {
  assert.match(providerIndependentProof, new RegExp(`${providerName}: "BLOCKED_`));
}

assert.match(runner, /status: "NO_GO"/);
assert.match(runner, /verdict: "NO_GO_PRODUCTION_ACCEPTANCE_NOT_PROVEN"/);
assert.match(runner, /providerAbsenceTreatedAsSuccess: false/);
assert.match(runner, /seededEndStatesTreatedAsJourneyProof: false/);
assert.match(runner, /workerExecutionRetryReplayDeadLetterAndCrashRecovery: "PASS"/);
assert.match(runner, /realSyntheticLeadCapturePersistenceAndDuplicateReplay: "PASS"/);
assert.match(runner, /supportInternalNonDeliveringInboxLifecycle: "PASS"/);
assert.match(runner, /reportingFreshStaleAndFailedRefreshStateHandling: "PASS"/);
assert.match(runner, /billingCancellationStaleEventReactivationAndReplayProjection: "PASS"/);
assert.match(runner, /accountDeletionRequestSuspensionAndDisabledWorkerBoundary: "PASS"/);
assert.match(runner, /ghlSandboxProvisioningFunnelsAndLeadDelivery:[\s\S]{0,100}"BLOCKED_EXTERNAL_PROVIDER_AUTHORITY"/);
assert.match(runner, /metaSandboxLaunchLeadgenReportingAndOptimization:[\s\S]{0,100}"BLOCKED_EXTERNAL_PROVIDER_AUTHORITY"/);
assert.match(runner, /stripeTestCheckoutAndSignedWebhook:[\s\S]{0,100}"BLOCKED_EXTERNAL_PROVIDER_AUTHORITY"/);
assert.match(runner, /productionReleaseAuthorized: false/);

assert.match(runner, /function assertEvidenceSanitized/);
assert.match(runner, /Evidence sanitization rejected an exact protected value/);
assert.match(runner, /REDACTED_SSR_AUTH_COOKIE/);
assert.match(runner, /\\bbase64-\[A-Za-z0-9_-\]\{24,\}/);
const protectedRuntimeValuesSource = runner.slice(
  runner.indexOf("function protectedRuntimeValues()"),
  runner.indexOf("function assertFailClosedExecutionEnvironment()"),
);
const successfulEvidenceSealSource = runner.slice(
  runner.indexOf("const seal = sealEvidenceBundle(options.evidenceDir, summary, ["),
  runner.indexOf("failureContext.sealCompleted = true;"),
);
assert.match(
  protectedRuntimeValuesSource,
  /process\.env\.VERCEL_AUTOMATION_BYPASS_SECRET/,
  "the complete protected runtime portfolio must include the Vercel automation bypass secret",
);
assert.match(
  successfulEvidenceSealSource,
  /\.\.\.protectedRuntimeValues\(\)/,
  "the final successful evidence seal must scan the complete protected runtime portfolio",
);

const sanitizationContractSource = runner.slice(
  runner.indexOf("function listEvidenceFiles(root)"),
  runner.indexOf("function sealEvidenceBundle("),
);
const sanitizationSandbox = {
  Buffer,
  join,
  lstatSync,
  readFileSync,
  readdirSync,
  relative,
};
runInNewContext(
  `${sanitizationContractSource}\nthis.assertEvidenceSanitizedForContract = assertEvidenceSanitized;`,
  sanitizationSandbox,
);
const exactBypassSecret = "vercel-automation-bypass-contract-secret-1234567890";
const exactSecretEvidenceDir = mkdtempSync(
  join(tmpdir(), "dealflow-exact-secret-sanitization-contract-"),
);
try {
  writeFileSync(
    join(exactSecretEvidenceDir, "proof.json"),
    JSON.stringify({ accidentallyPersisted: exactBypassSecret }),
  );
  assert.throws(
    () => sanitizationSandbox.assertEvidenceSanitizedForContract(
      exactSecretEvidenceDir,
      [exactBypassSecret],
    ),
    /Evidence sanitization rejected an exact protected value in proof\.json/,
    "the runner's exact sanitizer must reject a persisted Vercel bypass secret",
  );
} finally {
  rmSync(exactSecretEvidenceDir, { recursive: true, force: true });
}
assert.match(runner, /registerUnsealedPlaywrightArtifactDirectories/);
assert.match(runner, /deleteAllRegisteredUnsealedPlaywrightArtifacts/);
assert.match(runner, /UNSEALED_PLAYWRIGHT_FAILURE_POLICY/);
assert.match(runner, /failureContext\.unsealedPlaywrightArtifactDirectories = \[\]/);
assert.match(runner, /resetEvidenceDirectoryForSafeFailureBundle/);
assert.match(runner, /UNSAFE_PARTIAL_EVIDENCE_DESTROYED_AND_ROOT_RECREATED/);
assert.match(runner, /RETAINED_SANITIZED_PARTIAL_EVIDENCE/);
assert.match(runner, /failure-summary\.v1/);
assert.match(runner, /const failureSeal = sealEvidenceBundle/);
assert.match(reporterCleanupContract, /refused_outside_evidence_path/);
assert.match(reporterCleanupContract, /remainingDirectoryCount: 0/);
assert.match(reporterCleanupTest, /valid roots must still be purged after a bad path/);
assert.match(reporterCleanupTest, /failure\.png/);
assert.match(runner, /assertApprovedStagingEvidenceRootPath/);
assert.match(evidenceRootContract, /parent !== EXACT_TEMP_ROOT/);
assert.match(evidenceRootContract, /realpathSync\(parent\) !== EXACT_TEMP_ROOT/);
assert.match(evidenceRootContract, /real non-symlink directory/);
assert.match(evidenceRootTest, /symlinkParent/);
assert.match(evidenceRootTest, /direct child of the real private temp root/);
assert.match(runner, /evidence-manifest\.json/);
assert.match(runner, /SHA256SUMS/);
assert.match(runner, /containsSecrets: false/);
assert.match(runner, /containsRealCustomerData: false/);
assert.match(runner, /productionMutationPerformed: false/);
assert.match(runner, /providerMutationPerformed: false/);
assert.match(runner, /chmodSync\(path, 0o600\)/);
assert.match(runner, /chmodSync\(path, 0o700\)/);
assert.match(runner, /function writeTerminalFailureArtifact\(/);
assert.match(runner, /STAGING_FAILURE\.json/);
assert.match(runner, /sanitizedErrorSha256: sha256\(sanitizedMessage\)/);
assert.match(runner, /failureArtifactContainsSecrets: false/);
assert.match(runner, /partialBundleSecretStatus/);
assert.match(runner, /candidateIdentity: identity/);
assert.match(runner, /failureContext\.sealCompleted/);
assert.match(runner, /partialSealArtifactsPresent/);
assert.match(runner, /failureContext\.sealCompleted = true/);
assert.doesNotMatch(
  runner,
  /\["FINAL_SUMMARY\.json", "evidence-manifest\.json", "SHA256SUMS"\]\.some/,
  "a partial final-seal failure must still emit durable terminal-failure evidence",
);
assert.match(runner, /failureContext\.evidenceDir = options\.evidenceDir/);
assert.match(runner, /failureContext\.stage = "synthetic_staging_seed"/);
assert.match(runner, /writeTerminalFailureArtifact\(sanitizedMessage,/);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  assert.match(runner, new RegExp(`installCatchableTerminationHandler\\("${signal}"`));
}
assert.match(runner, /process\.once\("uncaughtException"/);
assert.match(runner, /process\.once\("unhandledRejection"/);
assert.match(runner, /finalizeFailureOnce/);
assert.match(runner, /terminationRequestPromise/);
assert.match(runner, /requestExecutionTermination\(firstOutcome\.error/);
assert.match(runner, /await drainInterruptibleCommands\(\)/);
assert.match(runner, /const finalMainOutcome = firstOutcome\.type === "termination"/);
assert.match(runner, /global: \{ fetch: allowDuringTermination \? cleanupFetch : executionFetch \}/);
assert.match(runner, /createStagingAdminClient\(\{ allowDuringTermination: true \}\)/);
assert.match(runner, /executionFetch\(`\$\{url\}\/privacy`/);
assert.match(runner, /assertExecutionMayContinue\(\);[\s\S]{0,180}const deleted = await admin/);
assert.doesNotMatch(
  runner,
  /process\.once\(signal, \(\) => \{[\s\S]{0,220}finalizeFailureOnce/,
  "signal handlers must only request termination; sealing waits for main quiescence",
);
assert.match(runner, /const rlsCrossTenantProof = await runCapturedProofCommand/);
assert.match(runner, /const rlsFixtureProof = await runCapturedProofCommand/);
assert.match(runner, /const providerIndependentProof = await runProviderIndependentStagingProof/);
assert.match(runner, /const multiRoleBrowser = await runPlaywrightSuite/);
assert.match(runner, /const safeProductBrowser = await runPlaywrightSuite/);
assert.match(runner, /const operatorDebtProof = await runCapturedProofCommand/);
assert.doesNotMatch(
  runner,
  /\brun\(EXECUTABLE/,
  "all staging and remote child commands must use the interruptible boundary",
);
assert.match(interruptibleCommand, /detached: process\.platform !== "win32"/);
assert.match(interruptibleCommand, /process\.kill\(-child\.pid, requestedSignal\)/);
assert.match(interruptibleCommand, /killTree\("SIGKILL"\)/);
assert.match(interruptibleCommandTest, /orphan-grandchild-sentinel/);
assert.match(interruptibleCommandTest, /nonzero-parent-orphan-sentinel/);
assert.match(interruptibleCommandTest, /output-limit force kill was not bounded/);
assert.match(interruptibleCommandTest, /timed out after 100ms/);
assert.match(runner, /process\.exitCode = request\.exitCode/);
assert.match(runner, /const vercel = resolvePinnedVercelCli\(\)/);
assert.match(runner, /async function runPinnedVercel\(/);
assert.match(
  runner,
  /const pinned = assertPinnedVercelCliUnchanged\(vercel\)[\s\S]+finally \{\s*assertPinnedVercelCliUnchanged\(vercel\)/,
  "every Vercel command must receive pre/post complete-closure validation",
);
assert.ok(
  (runner.match(/runPinnedVercel\(/g) ?? []).length >= 12,
  "all normal and rollback Vercel invocations must use the pinned boundary",
);
const pinnedVercelBoundaryStart = runner.indexOf("async function runPinnedVercel(");
const pinnedVercelBoundaryEnd = runner.indexOf("function git(", pinnedVercelBoundaryStart);
assert.ok(pinnedVercelBoundaryStart >= 0 && pinnedVercelBoundaryEnd > pinnedVercelBoundaryStart);
const runnerOutsidePinnedVercelBoundary =
  runner.slice(0, pinnedVercelBoundaryStart) + runner.slice(pinnedVercelBoundaryEnd);
assert.doesNotMatch(
  runnerOutsidePinnedVercelBoundary,
  /(?:\bvercel|\bpinned|vercelSelection)\.path\b/,
  "the selected executable path may be consumed only inside runPinnedVercel",
);
assert.doesNotMatch(runner, /\bvercel\.path\b/);
assert.doesNotMatch(runner, /failureContext\.vercelPath/);
assert.doesNotMatch(
  runner,
  /runInterruptible(?:AllowNonzero)?\([\s\S]{0,160}(?:vercel\.path|failureContext\.vercel)/,
  "no Vercel invocation may bypass runPinnedVercel",
);
assert.doesNotMatch(
  runner,
  /spawnSync\([\s\S]{0,180}(?:vercel\.path|failureContext\.vercel)/,
  "rollback Vercel commands must not bypass the pinned asynchronous boundary",
);
assert.match(runner, /disposePinnedVercelCli\(failureContext\.vercelSelection\)/);
assert.match(runner, /vercelCliSourcePathPersisted: false/);
assert.match(runner, /vercelCliSnapshotPathPersisted: false/);
assert.match(runner, /cliSourcePathPersisted: false/);
assert.match(runner, /cliSnapshotPathPersisted: false/);
assert.match(runner, /failureContext\.vercelSelection\?\.sourcePath/);
assert.match(runner, /failureContext\.vercelSelection\?\.installationRoot/);
assert.match(runner, /failureContext\.vercelSelection\?\.snapshotTrustRoot/);
assert.doesNotMatch(runner, /\.npm["'], ["']_npx/);
assert.match(vercelCliSelectionContract, /INSTALLATION_DIGEST_SCHEMA/);
assert.match(vercelCliSelectionContract, /SNAPSHOT_PREFIX/);
assert.match(vercelCliSelectionContract, /mtimeNs/);
assert.match(vercelCliSelectionContract, /ctimeNs/);
assert.match(vercelCliSelectionContract, /must use a relative internal symlink target/);
assert.match(vercelCliSelectionContract, /must be non-writable inside the pinned snapshot/);
assert.match(vercelCliSelectionContract, /VERCEL_CLI_INSTALLATION_SHA256/);
for (const mutationMarker of [
  "mutated-chunk",
  "mutated-dependency",
  "mutated-package",
  "added-file",
  "removed-file",
  "mutated-symlink",
  "mutated-mode",
  "escaping-symlink",
  "writable-package",
  "writable-directory",
]) {
  assert.match(vercelCliSelectionContractTest, new RegExp(mutationMarker));
}

assert.equal(
  packageJson.scripts["staging:acceptance"],
  "node ./scripts/staging/run-isolated-staging-acceptance.mjs",
);
assert.equal(
  packageJson.scripts["test:staging-acceptance-contract"],
  "node ./scripts/staging/test-install-synthetic-retention-authority-contract.mjs && node ./scripts/staging/test-vercel-staging-protection-contract.mjs && node ./scripts/staging/test-vercel-alias-propagation-contract.mjs && node ./scripts/staging/test-vercel-cli-selection-contract.mjs && node ./scripts/staging/test-provider-session-bundle-contract.mjs && node ./scripts/staging/test-browser-session-bundle-contract.mjs && node ./scripts/staging/test-browser-context-network-boundary.mjs && node ./scripts/staging/test-safe-browser-host-contract.mjs && node ./scripts/staging/test-staging-evidence-root-contract.mjs && node ./scripts/staging/test-interruptible-command.mjs && node ./scripts/staging/test-unsealed-playwright-artifact-cleanup.mjs && node ./scripts/staging/test-deployable-source-path-set-contract.mjs && node ./scripts/staging/test-vercel-dry-run-source-contract.mjs && node ./scripts/staging/test-exact-supabase-project-url.mjs && node ./scripts/staging/test-next-static-chunk-path.mjs && node ./scripts/staging/test-vercel-deployed-image-config-contract.mjs && node ./scripts/staging/test-approved-direct-public-image-checkpoint-contract.mjs && node ./scripts/staging/test-staging-image-optimizer-response-contract.mjs && node ./scripts/staging/test-isolated-staging-access-gate.mjs && node ./scripts/staging/test-hosted-build-identity-generator.mjs && node ./scripts/staging/test-release-identity-route-contract.mjs && node ./scripts/staging/test-isolated-staging-acceptance-contract.mjs",
);
assert.match(completionSuite, /"staging\/test-safe-browser-host-contract\.mjs"/);
assert.match(completionSuite, /"staging\/test-provider-session-bundle-contract\.mjs"/);
assert.match(completionSuite, /"staging\/test-browser-session-bundle-contract\.mjs"/);
assert.match(completionSuite, /"staging\/test-browser-context-network-boundary\.mjs"/);
assert.match(completionSuite, /"staging\/test-staging-evidence-root-contract\.mjs"/);
assert.match(completionSuite, /"staging\/test-interruptible-command\.mjs"/);
assert.match(completionSuite, /"staging\/test-unsealed-playwright-artifact-cleanup\.mjs"/);
assert.match(completionSuite, /"staging\/test-deployable-source-path-set-contract\.mjs"/);
assert.match(completionSuite, /"staging\/test-vercel-dry-run-source-contract\.mjs"/);
assert.match(completionSuite, /"staging\/test-vercel-alias-propagation-contract\.mjs"/);
assert.match(completionSuite, /"staging\/test-vercel-cli-selection-contract\.mjs"/);
assert.match(completionSuite, /"staging\/test-exact-supabase-project-url\.mjs"/);
assert.match(completionSuite, /"staging\/test-next-static-chunk-path\.mjs"/);
assert.match(completionSuite, /"staging\/test-vercel-deployed-image-config-contract\.mjs"/);
assert.match(completionSuite, /"staging\/test-approved-direct-public-image-checkpoint-contract\.mjs"/);
assert.match(completionSuite, /"staging\/test-staging-image-optimizer-response-contract\.mjs"/);
assert.match(completionSuite, /"staging\/test-isolated-staging-access-gate\.mjs"/);
assert.match(completionSuite, /"staging\/test-hosted-build-identity-generator\.mjs"/);
assert.match(completionSuite, /"staging\/test-release-identity-route-contract\.mjs"/);
assert.match(completionSuite, /"staging\/test-isolated-staging-acceptance-contract\.mjs"/);
assert.match(envExample, /^STAGING_PARTNER_APP_URL=$/m);
assert.match(envExample, /^STAGING_SECOND_PARTNER_APP_URL=$/m);
assert.match(envExample, /^DEALFLOW_STAGING_ACCEPTANCE_AUTHORIZATION=$/m);

const help = spawnSync(process.execPath, [runnerPath, "--help"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/private/tmp" },
  encoding: "utf8",
  timeout: 10_000,
});
assert.equal(help.status, 0, help.stderr);
assert.match(help.stdout, /Exactly one migration mode is required/);
assert.match(help.stdout, /--verify-existing-migrations --deploy/);
assert.match(help.stdout, /--apply-forward-migration --deploy/);
assert.match(
  help.stdout,
  /Exact forward-only migration 104[^\n]*:\n  node[^\n]* \\\n    --execute --apply-forward-migration --deploy \\\n    --prior-migration-proof-dir/s,
  "forward-mode help must preserve executable multiline shell continuations",
);

const refused = spawnSync(process.execPath, [runnerPath], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/private/tmp" },
  encoding: "utf8",
  timeout: 10_000,
});
assert.notEqual(refused.status, 0);
assert.match(refused.stderr, /No remote work was authorized/);

console.log(
  "isolated staging acceptance contract: PASS (execution/deploy plus exclusive fresh, read-only-resume, or exact-forward authorization gate; exact clean seal and hosted-only deferral allowlist; isolated qibh/Vercel identities; approved stdin-only staging config; 104-migration atomic broker with pinned read-only-proven 103-to-104 forward mode and owner-authority retention installation; two deployment-bound white-label partners and child tenants; authenticated RLS cleanup; ten-role plus fresh/stale/failed reporting and EN/FR/ES accessibility across four browsers with zero skips; real synthetic lead duplicate proof; support internal inbox; worker recovery; billing lifecycle; deletion fail-closed boundary; explicit external-provider blockers; production NO_GO; sanitized sealed evidence)",
);
