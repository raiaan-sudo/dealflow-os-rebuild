#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyAbortedInterceptedTelemetry,
  sanitizedTelemetryPurposeFingerprint,
} from "./expected-navigation-abort.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function read(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function requireAll(source, markers, label) {
  for (const marker of markers) {
    assert.ok(
      source.includes(marker),
      `${label} is missing required contract marker: ${marker}`,
    );
  }
}

const config = read("playwright.safe.config.ts");
const safeEnvironment = read("tests/e2e/safe-browser-environment.ts");
const spec = read("tests/e2e/dealflow-safe.spec.ts");
const canceledHomepagePrefetch = read("tests/e2e/expected-next-prefetch-abort.mjs");
const onboarding = read("src/app/(app)/onboarding/page.tsx");
const paywall = read("src/app/(app)/paywall/page.tsx");
const billingStatus = read("src/app/api/billing/status/route.ts");
const qaHarness = read("src/app/api/internal/qa-auth-session/route.ts");
const zeroEffects = read("src/lib/safety/zero-external-effects.ts");
const zeroEffectsRoute = read("src/app/api/internal/zero-external-effects/route.ts");
const globalPreflight = read("tests/e2e/global-safety-preflight.ts");
const hostedSafeOrigin = read("scripts/staging/safe-browser-host-contract.mjs");
const hostedSafeOriginTest = read("scripts/staging/test-safe-browser-host-contract.mjs");
const browserContextBoundary = read("scripts/staging/browser-context-network-boundary.mjs");
const browserContextBoundaryTest = read("scripts/staging/test-browser-context-network-boundary.mjs");
const acceptanceReporter = read("tests/e2e/safe-acceptance-reporter.mjs");
const proxy = read("src/proxy.ts");
const productMessages = read("src/lib/i18n/messages.ts");

requireAll(
  config,
  [
    'testMatch: ["dealflow-safe.spec.ts"]',
    'project("desktop-chromium"',
    'project("mobile-chromium"',
    'project("desktop-firefox"',
    'project("desktop-webkit"',
    'screenshot: "on"',
    'workers: 1',
    'fullyParallel: false',
    'serviceWorkers: "block"',
    'trace: configuredBaseUrl ? "off" : "retain-on-failure"',
    'globalSetup: "./tests/e2e/global-safety-preflight.ts"',
    '"json", { outputFile:',
    '"junit", { outputFile:',
    "safe-acceptance-reporter.mjs",
    "assertZeroExternalEffectsEnvironment(LOCAL_SAFE_SERVER_ENVIRONMENT)",
    "assertExactHostedSafeBrowserOrigin(configuredBaseUrl)",
    "VERCEL_AUTOMATION_BYPASS_SECRET",
    "exact-origin, no-redirect boundary",
  ],
  "Playwright safe config",
);
assert.doesNotMatch(config, /extraHTTPHeaders/);

requireAll(
  safeEnvironment,
  [
    'ALLOW_META_LIVE_LAUNCH: "false"',
    'ALLOW_SCHEDULED_META_LAUNCH_EXECUTION: "false"',
    'ALLOW_META_DUE_ACTIVATION: "false"',
    'GHL_SANDBOX_WRITES_ENABLED: "false"',
    'GHL_SANDBOX_INBOUND_FORM_RECONCILIATION_ENABLED: "false"',
    'GHL_SANDBOX_INBOUND_FORM_SWEEP_ENABLED: "false"',
    'GHL_PRODUCTION_WRITES_ENABLED: "false"',
    'GHL_PRODUCTION_INBOUND_FORM_RECONCILIATION_ENABLED: "false"',
    'GHL_PRODUCTION_INBOUND_FORM_SWEEP_ENABLED: "false"',
    'SUPPORT_EXTERNAL_DELIVERY_ENABLED: "false"',
    'ALLOW_OPENAI_IMAGE_GENERATION: "false"',
    'ALLOW_HEYGEN_LEGACY_FALLBACK: "false"',
    'ALLOW_HIGGSFIELD_VIDEO_GENERATION: "false"',
    'STRIPE_FORCE_TEST_MODE: "false"',
    'STRIPE_TEST_HARNESS_ENABLED: "false"',
    'LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED: "false"',
    'ACCOUNT_DELETION_EXECUTION_ENABLED: "false"',
    'ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED: "false"',
    'GHL_ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED: "false"',
    'TWILIO_EXECUTION_MODE: "disabled"',
  ],
  "Local safe browser server environment",
);

requireAll(
  spec,
  [
    "ZERO_EXTERNAL_EFFECTS_ATTESTATION",
    'const EXPECTED_STAGING_SAFE_SUFFIX = "qibh"',
    "PRODUCTION_HOSTS",
    "READ_ONLY_METHODS",
    'requestUrl.pathname === "/api/onboarding/plan"',
    'requestUrl.search === ""',
    'requestUrl.hash === ""',
    'method === "DELETE"',
    "HOSTED_ACCEPTANCE",
    "AUTHENTICATED_STAGING_PROOF_ENABLED",
    "exactSyntheticStagingDraftMutation",
    'gotoAndSettle(page, "/onboarding?new=1")',
    'requestUrl.pathname === "/api/activation/events"',
    "installBrowserContextNetworkBoundary(context",
    'route.abort("blockedbyclient")',
    "forbiddenMutations",
    "forbiddenHosts",
    "blockedWebSockets",
    "hydrationFailures",
    "pageErrors",
    "requestFailures",
    "serverFailures",
    "assertNoHorizontalOverflow",
    "assertNamedInteractiveControls",
    "assertKeyboardFocus",
    "AxeBuilder",
    "wcag2aa",
    "assertSkipLinkAndReducedMotion",
    "reducedMotion: \"reduce\"",
    "assertTwoHundredPercentZoom",
    "assertPublicLinksResolve",
    "assertAuthenticatedStagingPreconditions",
    "assertExactHostedSafeBrowserOrigin(BASE_URL)",
    "establishQaSession",
    "assertZeroExternalEffectsEnvironment(process.env)",
    "waitForPersistedDraftState",
    "readPersistedDraftState",
    'page.request.get("/api/onboarding/plan"',
    "The onboarding draft did not durably persist ${expectedStep}:${expectedDestination}.",
    '.toBe(`${expectedStep}:${expectedDestination}`)',
    'chooseDestination(page, "Website funnel")',
    'chooseDestination(page, "Meta Instant Form")',
    'assertReviewDestination(page, "Website funnel")',
    'assertReviewDestination(page, "Meta Instant Form")',
    'expect(billing.planTier).toBe("pro")',
    'expect(credits.balance).toBe(1000)',
    'expect(credits.formattedBalance).toBe("$10.00")',
    'getByText("Pro · $297/mo"',
    "isExpectedCanceledHomepagePrefetch",
    "successfulResponseStatusByRequest",
    'page.getByTestId("onboarding-current-step-panel")',
    'page.getByTestId("prepaywall-campaign-preview")',
    'assertReviewCard("agent"',
    'assertReviewCard("campaign-type"',
    'assertReviewCard("market"',
    'assertReviewCard("property-type"',
    'assertReviewCard("price-deal-size"',
    'assertReviewCard("daily-budget"',
    '"Daily ad spend budget"',
    'assertReviewCard("lead-capture-style"',
    '"Lead capture style"',
    '"monthly-estimate"',
    '"Estimated 30-day media spend: $900."',
    '"Private Listings and a Fast Buyer Strategy Call"',
    'assertReviewCard("destination"',
    '"Pro access: unlimited campaign slots"',
    'name: "Campaign plan not found", exact: true',
    'name: "Selected creative required", exact: true',
    'name: "Final review before launch", exact: true',
    "launchStateCounts.reduce",
    'a[href^="/launching"]',
    'name: "Open dashboard"',
    'a[href*="/build/creatives?campaignId="]',
    'a[href="/en/launch"]',
    'a[href="/fr/launch"]',
    'a[href="/es/launch"]',
    "await expect(launchLink).toHaveCount(1)",
    "expect(campaignLaunchHref).toBeTruthy()",
    "expect(campaignLaunchUrl.origin).toBe(new URL(BASE_URL).origin)",
    "expect(ALLOWED_LAUNCH_PATHNAMES.has(campaignLaunchUrl.pathname)).toBe(true)",
    'expect(campaignLaunchUrl.hash).toBe("")',
    "expect([...campaignLaunchUrl.searchParams.keys()]).toEqual([])",
    'expect([...campaignLaunchUrl.searchParams.keys()]).toEqual(["campaignId"])',
    'expect(["en", "fr", "es"]).toContain(launchLocale)',
    'expect(buildCreativesUrl.pathname).toBe(`/${launchLocale}/build/creatives`)',
    'expect([...buildCreativesUrl.searchParams.keys()]).toEqual(["campaignId"])',
    'const resolvedCampaignId = buildCreativesUrl.searchParams.get("campaignId")',
    "expect(resolvedCampaignId).toMatch(CAMPAIGN_UUID_PATTERN)",
    "if (expectedCampaignId !== null)",
    "expect(expectedCampaignId).toMatch(CAMPAIGN_UUID_PATTERN)",
    "expect(resolvedCampaignId).toBe(expectedCampaignId)",
    'dealflow.safe-browser-aborted-post-classification.v1',
    "classifyAbortedInterceptedTelemetry({",
    "sanitizedTelemetryPurposeFingerprint(request.postData())",
    "locallyInterceptedTelemetry.get(request) === true",
    "successfulTelemetryRequests: diagnostics.successfulTelemetryRequests",
    "userVisibleErrorCount: diagnostics.onboardingUserVisibleErrorCount",
    'classification === "unproven"',
    'diagnosticsFor(page).onboardingPersistenceProven = true',
    "page.request.fetch(target.toString()",
    "target.origin !== EXPECTED_HOSTED_SAFE_BROWSER_ORIGIN",
    'target.pathname !== "/api/internal/qa-auth-session"',
    "maxRedirects: 0",
    'expect(response.url(), "QA session harness must not redirect")',
    "safeHttpEvidenceTarget(request.url())",
    "scopedStagingAccessHeaders({",
    "stagingAccessCookiesForOrigins({",
    "primeVercelAutomationBypassCookies({",
    "VERCEL_AUTOMATION_PROTECTION_PORTFOLIO",
    "getVercelAutomationBypassSecret(",
    "context.addCookies(",
    "appRequestHeaders(",
  ],
  "Browser proof spec",
);
assert.doesNotMatch(spec, /getByText\("Daily ad spend",\s*\{ exact: true \}\)/);
assert.doesNotMatch(spec, /getByText\("Lead capture",\s*\{ exact: true \}\)/);
assert.doesNotMatch(spec, /following-sibling/);
assert.doesNotMatch(
  spec,
  /method === "DELETE"\s*\|\|/,
  "Synthetic draft DELETE authority must remain conjunctive and staging-authenticated",
);
assert.doesNotMatch(
  spec,
  /errorText === "net::ERR_ABORTED"[^]*requestFailures\.push\([^)]*\)\s*;?\s*}\s*else/s,
  "Aborted POSTs must remain bound to exact local telemetry and lifecycle proof",
);

const purposeA = sanitizedTelemetryPurposeFingerprint(JSON.stringify({
  eventName: "onboarding_step_completed",
  idempotencyKey: "onboarding_step_completed:00000000-0000-4000-8000-000000000001:intent",
  metadata: { ignored: "must-not-enter-the-fingerprint" },
}));
const purposeB = sanitizedTelemetryPurposeFingerprint(JSON.stringify({
  eventName: "onboarding_step_completed",
  idempotencyKey: "onboarding_step_completed:00000000-0000-4000-8000-000000000001:market",
}));
assert.match(purposeA ?? "", /^sha256:[a-f0-9]{64}$/);
assert.match(purposeB ?? "", /^sha256:[a-f0-9]{64}$/);
assert.notEqual(purposeA, purposeB);
assert.equal(purposeA?.includes("intent"), false);
assert.equal(sanitizedTelemetryPurposeFingerprint("not-json"), null);

const exactAbortedTelemetryCandidate = Object.freeze({
  requestClass: "locally_intercepted_activation_telemetry",
  method: "POST",
  errorText: "net::ERR_ABORTED",
  isNavigationRequest: false,
  target: "https://safe.invalid/api/activation/events",
  resourceType: "fetch",
  initiatorPath: "/onboarding",
  elapsedMs: 25,
  telemetrySequence: 1,
  navigationSequenceAtStart: 1,
  purposeFingerprint: purposeA,
  interceptedBeforeNetwork: true,
});
const classify = (overrides = {}) => classifyAbortedInterceptedTelemetry({
  candidate: exactAbortedTelemetryCandidate,
  completedMainFrameNavigationCount: 1,
  finalPersistedState: true,
  successfulTelemetryRequests: [],
  userVisibleErrorCount: 0,
  ...overrides,
});

const successfulSamePurpose = classify({
  successfulTelemetryRequests: [
    { telemetrySequence: 2, purposeFingerprint: purposeA, status: 204 },
  ],
});
assert.equal(successfulSamePurpose.classification, "harmless_locally_intercepted_telemetry");
assert.equal(successfulSamePurpose.supersededBy, "successful_same_purpose_request");
assert.equal(successfulSamePurpose.duplicateApplicationEffects, 0);

const unrelatedSuccess = classify({
  successfulTelemetryRequests: [
    { telemetrySequence: 2, purposeFingerprint: purposeB, status: 204 },
  ],
});
assert.equal(unrelatedSuccess.classification, "unproven");
assert.equal(unrelatedSuccess.supersededBy, null);

const completedNavigation = classify({
  completedMainFrameNavigationCount: 2,
  successfulTelemetryRequests: [
    { telemetrySequence: 2, purposeFingerprint: purposeB, status: 204 },
  ],
});
assert.equal(completedNavigation.classification, "harmless_locally_intercepted_telemetry");
assert.equal(completedNavigation.supersededBy, "completed_navigation");

assert.equal(classify({
  successfulTelemetryRequests: [
    { telemetrySequence: 2, purposeFingerprint: purposeA, status: 500 },
  ],
}).classification, "unproven");
assert.equal(classify({ finalPersistedState: false }).classification, "unproven");
assert.equal(classify({ userVisibleErrorCount: 1 }).classification, "unproven");
const unintercepted = classify({
  candidate: { ...exactAbortedTelemetryCandidate, interceptedBeforeNetwork: false },
  completedMainFrameNavigationCount: 2,
});
assert.equal(unintercepted.classification, "unproven");
assert.equal(unintercepted.duplicateApplicationEffects, null);

requireAll(
  canceledHomepagePrefetch,
  [
    "EXACT_HOMEPAGE_PREFETCH_PATHS",
    'method === "GET"',
    'resourceType === "fetch"',
    "isNavigationRequest === false",
    'errorText === "net::ERR_ABORTED"',
    'rscHeader === "1"',
    'nextRouterPrefetchHeader === "1"',
    "successfulResponseStatus === 200",
    "rscValues.length !== 1",
    "/^[A-Za-z0-9_-]{1,128}$/",
    'frame.pathname !== "/"',
    "hasExactPrefetchQueryShape(request)",
  ],
  "Canceled homepage prefetch classifier",
);

const qaHarnessClientSource = spec.slice(
  spec.indexOf("async function establishQaHarnessSession("),
  spec.indexOf("async function establishQaSession("),
);
const mutationDispositionSource = spec.slice(
  spec.indexOf("function mutationDisposition("),
  spec.indexOf("async function installSafetyHarness("),
);
const safetyHarnessSource = spec.slice(
  spec.indexOf("async function installSafetyHarness("),
  spec.indexOf("function diagnosticsFor("),
);
assert.doesNotMatch(mutationDispositionSource, /qa_session|qa-auth-session/);
assert.match(spec, /const READ_ONLY_METHODS = new Set\(\["GET", "HEAD", "OPTIONS"\]\)/);
assert.match(mutationDispositionSource, /requestUrl\.username === ""/);
assert.match(mutationDispositionSource, /return "forbidden" as const/);
assert.doesNotMatch(spec, /MUTATING_METHODS/);
assert.doesNotMatch(
  qaHarnessClientSource,
  /page\.evaluate/,
  "The restricted internal secret must never enter browser JavaScript",
);
assert.doesNotMatch(
  spec,
  /page\.request\.(?:post|put|patch|delete)\s*\(/i,
  "Every APIRequestContext mutation must use the exact guarded wrapper",
);
assert.doesNotMatch(spec, /process\.env\.INTERNAL_SYSTEM_JOBS_SECRET/);
assert.doesNotMatch(spec, /process\.env\.CRON_SECRET/);
assert.doesNotMatch(
  safetyHarnessSource,
  /scopedStagingAccessHeaders|route\.continue\(\{\s*headers/,
  "Browser route overrides must not carry the staging gate through redirects",
);
assert.match(safetyHarnessSource, /stagingAccessCookiesForOrigins\(\{/);
assert.match(safetyHarnessSource, /await route\.continue\(\)/);
assert.match(safetyHarnessSource, /context\.on\("request"/);
assert.match(safetyHarnessSource, /Redirect targets are observable here/);
assert.equal(
  (spec.match(/page\.request\.(?:get|fetch)\s*\(/g) ?? []).length,
  (spec.match(/maxRedirects:\s*0/g) ?? []).length,
  "Every gate-bearing APIRequestContext call must refuse redirects",
);

requireAll(
  zeroEffects,
  [
    "DEALFLOW_ISOLATED_STAGING_QIBH_ZERO_EXTERNAL_EFFECTS_V1",
    "evaluateZeroExternalEffectsEnvironment",
    "assertZeroExternalEffectsEnvironment",
    "ALLOW_META_LIVE_LAUNCH",
    "ALLOW_META_PRODUCTION_OPTIMIZATION",
    "GHL_PRODUCTION_WRITES_ENABLED",
    "GHL_SANDBOX_INBOUND_FORM_SWEEP_ENABLED",
    "GHL_PRODUCTION_INBOUND_FORM_SWEEP_ENABLED",
    "SUPPORT_PRODUCTION_EXTERNAL_DELIVERY_ENABLED",
    "ALLOW_HIGGSFIELD_VIDEO_GENERATION",
    "ALLOW_HEYGEN_LEGACY_FALLBACK",
    "TWILIO_EXECUTION_MODE",
    "STRIPE_FORCE_TEST_MODE",
    "STRIPE_TEST_HARNESS_ENABLED",
    "LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED",
    "LOAD_TEST_ALLOW_SYNTHETIC_LEAD_CAPTURE",
    "ACCOUNT_DELETION_EXECUTION_ENABLED",
    "ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED",
    "GHL_ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED",
    "SUPPORT_NOTIFICATION_DELIVERY_MODE",
    "NEXT_PUBLIC_ENABLE_GOOGLE_AUTH",
    "ENABLE_STRUCTURED_INFO_LOGS",
  ],
  "Central zero-external-effects evaluator",
);

requireAll(
  globalPreflight,
  [
    "SAFE_E2E_QA_AUTH=true",
    "SAFE_E2E_ZERO_EXTERNAL_EFFECTS_ATTESTATION",
    "assertExactHostedSafeBrowserOrigin(baseUrl.toString())",
    "QA_ISOLATED_SUPABASE_PROJECT_REF",
    'new URL("/api/internal/zero-external-effects", exactBaseUrl)',
    'authenticated_deferred',
    'safety-preflight.json',
    "process.env.SAFE_E2E_INTERNAL_SECRET",
    "STAGING_ACCESS_GATE_SECRET",
    "[STAGING_ACCESS_HEADER]: stagingAccessGateSecret",
    "vercelAutomationBypassHeadersForExactOrigin({",
    "exactVercelAutomationProtectionPortfolio({",
    "vercelProtection.vercelAutomationBypassRequired",
    "VERCEL_AUTOMATION_PROTECTION_PORTFOLIO",
    "VERCEL_AUTOMATION_BYPASS_SECRET",
    'redirect: "manual"',
    "response.url !== endpoint.toString()",
  ],
  "Global browser safety preflight",
);
assert.doesNotMatch(globalPreflight, /process\.env\.INTERNAL_SYSTEM_JOBS_SECRET/);
assert.doesNotMatch(globalPreflight, /process\.env\.CRON_SECRET/);

requireAll(
  browserContextBoundary,
  [
    'context.route("**/*"',
    "context.routeWebSocket(/.*/",
    "recordBlockedWebSocket(url)",
    "webSocketRoute.close({",
    "isExactLocalNextDevelopmentWebSocket",
    "export function safeHttpEvidenceTarget",
    'export const STAGING_ACCESS_COOKIE = "__Host-dealflow-staging-access"',
    "export function stagingAccessCookiesForOrigins",
    "export async function primeVercelAutomationBypassCookies",
    "export function exactVercelAutomationProtectionPortfolio",
    'export const VERCEL_AUTOMATION_BYPASS_COOKIE = "_vercel_jwt"',
    "maxRedirects: 0",
    "responseStatus !== 307",
    "resolvedResponseLocation !== requestUrl",
    "primedOriginCount",
    'httpOnly: true',
    'secure: true',
    'sameSite: /** @type {"Lax"} */ ("Lax")',
    "top-level GET return from Meta OAuth or Stripe",
  ],
  "BrowserContext HTTP and WebSocket boundary",
);
requireAll(
  browserContextBoundaryTest,
  [
    "https://forbidden.example/popup",
    "wss://user:secret@forbidden.example/socket?token=secret",
    "WebSocket evidence must not retain credentials",
    "ws://127.0.0.1:3410/_next/webpack-hmr",
    "ws://127.0.0.1:3410/_next/webpack-hmr?id=synthetic",
    "staging access gate leaked to",
    "https://user:secret@forbidden.example/oauth/callback?token=secret#secret",
    "https://forbidden.example/oauth/callback",
    "stagingAccessCookiesForOrigins({",
    "Object.hasOwn(cookie, \"domain\")",
    "vercelPrimingCalls",
    "mixedProtectionPortfolio",
    "the unprotected stable alias received a Vercel bypass request",
    "partialFailureCookies.size, 0",
    "redirect-followed",
    "domain-cookie",
    "an inexact origin reached the priming transport",
    "exact HTTPS origins and a strong secret",
    "source.localhost",
    "target.localhost",
    '["chromium", chromium]',
    '["firefox", firefox]',
    '["webkit", webkit]',
    "/provider-return?engine=",
    "/provider-callback?engine=",
  ],
  "BrowserContext dynamic negative boundary tests",
);

requireAll(
  hostedSafeOrigin,
  [
    "https://dealflow-os-rebuild-selfserve-clean.vercel.app",
    "url.origin !== EXPECTED_HOSTED_SAFE_BROWSER_ORIGIN",
    'url.username !== ""',
    'url.pathname !== "/"',
  ],
  "Exact hosted safe-browser origin gate",
);

requireAll(
  hostedSafeOriginTest,
  [
    "vercel.app:444",
    "user:pass@",
    "evil.example.com",
    "not a url",
  ],
  "Exact hosted safe-browser origin negative tests",
);

requireAll(
  acceptanceReporter,
  [
    'const AUTHENTICATED_SUITE = "authenticated isolated-staging product proof"',
    'status: "authenticated_deferred"',
    'status === "skipped"',
    'Hosted acceptance skipped',
    'Hosted acceptance executed zero authenticated tests',
    'safe-browser-acceptance-summary.json',
    'return { status: "failed" }',
  ],
  "Safe browser acceptance reporter",
);

requireAll(
  zeroEffectsRoute,
  [
    "assertInternalSystemRequest",
    "isExplicitNonProductionDeployment",
    "isExactIsolatedSupabaseProject",
    "evaluateZeroExternalEffectsEnvironment(process.env)",
    "zero_external_effects_not_proven",
  ],
  "Hosted zero-external-effects proof route",
);

requireAll(
  onboarding,
  [
    "getOnboardingOptionCatalog(locale)",
    'method: "PUT"',
    "buildOnboardingDraftEnvelope",
    "currentStep",
    "furthestStepIndex",
    'label: t("onboarding.destination"), value: t(draft.adDestination === "website" ? "onboarding.destination.website" : "onboarding.destination.meta")',
    'data-testid={`onboarding-review-${key}`}',
    'data-testid="onboarding-review-label"',
    'data-testid="onboarding-review-value"',
    't("onboarding.planArchived")',
    'canUseExistingLaunchAccess ? t("onboarding.continueCreatives") : t("onboarding.activatePro")',
  ],
  "Integrated onboarding UI",
);

requireAll(
  productMessages,
  [
    '"onboarding.destination.website": "Website funnel"',
    '"onboarding.destination.meta": "Meta Instant Form"',
    '"onboarding.destination.website": "Entonnoir Web"',
    '"onboarding.destination.meta": "Formulaire instantané Meta"',
    '"onboarding.destination.website": "Embudo web"',
    '"onboarding.destination.meta": "Formulario instantáneo de Meta"',
    '"onboarding.planArchived": "Performance usage billing and guided-launch-only behavior are archived for new signups.',
  ],
  "Localized onboarding catalog",
);

requireAll(
  paywall,
  [
    'title={t("billing.campaignReady")}',
    'description={t("billing.paywallDescription")}',
    't("billing.activate")',
    "proPlan.priceLabel",
    "CheckoutButton",
  ],
  "Integrated paywall UI",
);

requireAll(
  productMessages,
  [
    '"billing.paywallDescription": "Preview stays free. An active subscription is required before this campaign can launch to Meta."',
    '"billing.paywallDescription": "L\'aperçu demeure gratuit. Un abonnement actif est requis avant le lancement de cette campagne dans Meta."',
    '"billing.paywallDescription": "La vista previa sigue siendo gratuita. Se requiere una suscripción activa antes de lanzar esta campaña en Meta."',
  ],
  "Localized paywall catalog",
);

requireAll(
  billingStatus,
  [
    "commerciallyActivated",
    "launchAllowed",
    "activationIsHistorical: true",
    "entitlementIsCurrent: true",
    "setupReadinessIsSeparate: true",
  ],
  "Billing truth API",
);

requireAll(
  qaHarness,
  [
    "assertInternalSystemRequest",
    "assertQaHarnessEnabled",
    "assertQaIsolatedSupabaseProject",
    "assertQaUserIsNonAdmin",
    'select("id,email,partner_id")',
    "qa_user_partner_binding_rejected",
    'from("organizations")',
    'eq("owner_user_id", userId)',
    "qa_user_organization_owner_rejected",
    'access: "non_admin_qa"',
    "redactEmail",
  ],
  "QA auth harness",
);

requireAll(
  proxy,
  [
    '"/dashboard"',
    '"/launch"',
    'buildLocalePreservingPath(request, "/login")',
    'loginUrl.searchParams.set("redirectedFrom"',
  ],
  "Route protection proxy",
);

const forbiddenClickPatterns = [
  /getByRole\("button",\s*\{\s*name:\s*"Activate to launch"[^\n]*\.click\(/,
  /getByRole\("link",\s*\{\s*name:\s*"Ready to attempt launch"[^\n]*\.click\(/,
  /getByRole\("button",\s*\{\s*name:\s*"Connect Meta"[^\n]*\.click\(/,
  /\/api\/billing\/checkout[^\n]*method:\s*"POST"/,
  /\/api\/campaigns\/[^\n]*\/launch[^\n]*method:\s*"POST"/,
];

for (const pattern of forbiddenClickPatterns) {
  assert.doesNotMatch(spec, pattern, `Browser proof contains a forbidden effect trigger: ${pattern}`);
}

assert.doesNotMatch(
  spec,
  /console\.log\([^)]*(SECRET|TOKEN|PASSWORD|COOKIE)/i,
  "Browser proof must never log secret-bearing values.",
);
assert.doesNotMatch(
  spec,
  /test\.only|describe\.only/,
  "Browser proof must not narrow execution with .only.",
);

console.log("DealFlow safe browser proof static contract: PASS");
console.log("Verified desktop/mobile, public gates, isolated auth, onboarding destinations, activation truth, launch gates, diagnostics, accessibility, and zero external effects.");
