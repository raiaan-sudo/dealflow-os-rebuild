#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
const onboarding = read("src/app/(app)/onboarding/page.tsx");
const paywall = read("src/app/(app)/paywall/page.tsx");
const billingStatus = read("src/app/api/billing/status/route.ts");
const qaHarness = read("src/app/api/internal/qa-auth-session/route.ts");
const zeroEffects = read("src/lib/safety/zero-external-effects.ts");
const zeroEffectsRoute = read("src/app/api/internal/zero-external-effects/route.ts");
const globalPreflight = read("tests/e2e/global-safety-preflight.ts");
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
  ],
  "Playwright safe config",
);

requireAll(
  safeEnvironment,
  [
    'ALLOW_META_LIVE_LAUNCH: "false"',
    'ALLOW_SCHEDULED_META_LAUNCH_EXECUTION: "false"',
    'ALLOW_META_DUE_ACTIVATION: "false"',
    'GHL_SANDBOX_WRITES_ENABLED: "false"',
    'GHL_SANDBOX_INBOUND_FORM_RECONCILIATION_ENABLED: "false"',
    'GHL_PRODUCTION_WRITES_ENABLED: "false"',
    'GHL_PRODUCTION_INBOUND_FORM_RECONCILIATION_ENABLED: "false"',
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
    "MUTATING_METHODS",
    'requestUrl.pathname === "/api/onboarding/plan"',
    'requestUrl.pathname === "/api/activation/events"',
    'page.route("**/*"',
    'route.abort("blockedbyclient")',
    "forbiddenMutations",
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
    "establishQaSession",
    "assertZeroExternalEffectsEnvironment(process.env)",
    "waitForSuccessfulDraftWrite",
    'chooseDestination(page, "Website funnel")',
    'chooseDestination(page, "Meta Instant Form")',
    'assertReviewDestination(page, "Website funnel")',
    'assertReviewDestination(page, "Meta Instant Form")',
    'expect(billing.planTier).toBe("pro")',
    'expect(credits.balance).toBe(1000)',
    'expect(credits.formattedBalance).toBe("$10.00")',
    'getByText("Pro · $297/mo"',
    "Launch is blocked",
  ],
  "Browser proof spec",
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
    "Hosted acceptance requires a nonproduction HTTPS base URL",
    "QA_ISOLATED_SUPABASE_PROJECT_REF",
    'new URL("/api/internal/zero-external-effects", baseUrl)',
    'authenticated_deferred',
    'safety-preflight.json',
  ],
  "Global browser safety preflight",
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
    '[t("onboarding.destination"), t(draft.adDestination === "website" ? "onboarding.destination.website" : "onboarding.destination.meta")]',
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
