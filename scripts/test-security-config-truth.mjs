#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  analyzeRouteSource,
  parsePublicApiAllowlistSource,
} from "./check-route-security.mjs";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

class TestApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function loadTypeScriptModule(source, options = {}) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  const emptyModule = new Proxy(
    { ApiError: TestApiError },
    {
      get(target, property) {
        if (property in target) {
          return target[property];
        }
        return () => undefined;
      },
    },
  );
  const runtimeProcess = options.process ?? { env: {} };
  const runtimeConsole = options.console ?? console;
  const evaluate = new Function("require", "module", "exports", "process", "console", output);
  evaluate(
    (specifier) => options.dependencies?.get(specifier) ?? emptyModule,
    loadedModule,
    loadedModule.exports,
    runtimeProcess,
    runtimeConsole,
  );
  return loadedModule.exports;
}

function assertThrowsCode(operation, expectedCode) {
  assert.throws(operation, (error) => error instanceof TestApiError && error.code === expectedCode);
}

const decoyAnalysis = analyzeRouteSource(`
  import { assertSameOriginRequest } from "@/lib/api/route";
  const comment = "assertInternalSystemRequest QA_AUTH_HARNESS_ENABLED";
  export async function POST() { return Response.json({ comment }); }
`);
assert.deepEqual([...decoyAnalysis.methods], ["POST"]);
assert.equal(decoyAnalysis.handlerFacts.get("POST").calls.has("assertSameOriginRequest"), false);
assert.equal(decoyAnalysis.handlerFacts.get("POST").calls.has("assertInternalSystemRequest"), false);
assert.equal(decoyAnalysis.handlerFacts.get("POST").env.has("QA_AUTH_HARNESS_ENABLED"), false);

const reachableGuardAnalysis = analyzeRouteSource(`
  function guarded(request: Request) {
    assertSameOriginRequest(request);
    if (process.env.TEST_GATE !== "true") throw new Error("closed");
  }
  const handler = async (request: Request) => { guarded(request); return new Response(); };
  export { handler as PATCH };
`);
assert.deepEqual([...reachableGuardAnalysis.methods], ["PATCH"]);
assert.equal(reachableGuardAnalysis.handlerFacts.get("PATCH").calls.has("assertSameOriginRequest"), true);
assert.equal(reachableGuardAnalysis.handlerFacts.get("PATCH").env.has("TEST_GATE"), true);

const parsedAllowlist = parsePublicApiAllowlistSource(`
  // const PUBLIC_API_PATHS = new Set(["/api/comment-decoy"]);
  const PUBLIC_API_PATHS = new Set(["/api/real"]);
`);
assert.deepEqual([...parsedAllowlist], ["/api/real"]);

const loggingSource = read("src/lib/logging.ts");
const capturedLogs = [];
const logging = loadTypeScriptModule(loggingSource, {
  process: { env: { NODE_ENV: "production" } },
  console: {
    error(value) { capturedLogs.push(value); },
    warn(value) { capturedLogs.push(value); },
    info(value) { capturedLogs.push(value); },
  },
});
const cyclic = { requestId: "req-safe", authorization: "Bearer sentinel-auth" };
cyclic.self = cyclic;
logging.logError(
  "Failure for owner@example.com token=sentinel-query +14165550123 sk-proj-abcdefghijklmnop sb_secret_abcdefghijklmnop EAAabcdefghijklmnopqrstuv",
  {
    requestId: "req-safe",
    nested: {
      email: "owner@example.com",
      phone: "+14165550123",
      password: "sentinel-password",
      secretConfigured: true,
    },
    providerError: new Error("Authorization: Bearer sentinel-error"),
    cyclic,
  },
);
assert.equal(capturedLogs.length, 1);
const serializedLog = capturedLogs[0];
for (const sentinel of [
  "owner@example.com",
  "+14165550123",
  "sentinel-password",
  "sentinel-auth",
  "sentinel-error",
  "sentinel-query",
  "sk-proj-",
  "sb_secret_",
  "EAAabcdefghijklmnopqrstuv",
]) {
  assert.equal(serializedLog.includes(sentinel), false, `log leaked ${sentinel}`);
}
const parsedLog = JSON.parse(serializedLog);
assert.equal(parsedLog.payload.requestId, "req-safe");
assert.equal(parsedLog.payload.nested.secretConfigured, true);
assert.equal(parsedLog.payload.cyclic.self, "[CIRCULAR]");

const clientTelemetrySource = read("src/app/api/client-errors/route.ts");
assert.match(clientTelemetrySource, /PUBLIC_CLIENT_ERROR_TELEMETRY_ENABLED !== "true"/);
assert.match(clientTelemetrySource, /status: 404/);

const qaSource = read("src/app/api/internal/qa-auth-session/route.ts");
const qaTestSource = qaSource.replace(
  "function assertQaHarnessEnabled()",
  "export function assertQaHarnessEnabled()",
).replace(
  "function assertQaIsolatedSupabaseProject(",
  "export function assertQaIsolatedSupabaseProject(",
);
const qaProcess = { env: {} };
const qaDeploymentModule = loadTypeScriptModule(read("src/lib/deployment-target.ts"), {
  process: qaProcess,
});
const qaModule = loadTypeScriptModule(qaTestSource, {
  process: qaProcess,
  dependencies: new Map([["@/lib/deployment-target", qaDeploymentModule]]),
});
qaProcess.env = { NODE_ENV: "production", QA_AUTH_HARNESS_ENABLED: "true" };
assertThrowsCode(qaModule.assertQaHarnessEnabled, "qa_auth_harness_target_unattested");
qaProcess.env = { NODE_ENV: "development", VERCEL_ENV: "production", QA_AUTH_HARNESS_ENABLED: "true" };
assertThrowsCode(qaModule.assertQaHarnessEnabled, "qa_auth_harness_target_unattested");
qaProcess.env = { NODE_ENV: "production", DEALFLOW_DEPLOYMENT_TARGET: "staging", QA_AUTH_HARNESS_ENABLED: "true" };
assert.doesNotThrow(qaModule.assertQaHarnessEnabled);
qaProcess.env = { NODE_ENV: "development", DEALFLOW_DEPLOYMENT_TARGET: "staging", QA_AUTH_HARNESS_ENABLED: "false" };
assertThrowsCode(qaModule.assertQaHarnessEnabled, "qa_auth_harness_disabled");
qaProcess.env = { NODE_ENV: "development", DEALFLOW_DEPLOYMENT_TARGET: "staging", QA_AUTH_HARNESS_ENABLED: "true" };
assert.doesNotThrow(qaModule.assertQaHarnessEnabled);
assert.match(qaSource, /"owner"/);
assert.match(qaSource, /QA_ISOLATED_SUPABASE_PROJECT_REF/);
assert.match(qaSource, /assertQaIsolatedSupabaseProject\(supabaseEnv\.url\)/);
assert.match(qaSource, /admin\.auth\.admin\.getUserById\(userId\)/);
assert.match(qaSource, /qa_user_partner_binding_rejected/);
assert.match(qaSource, /\.from\("organizations"\)[\s\S]*\.eq\("owner_user_id", userId\)/);
assert.match(qaSource, /qa_user_organization_owner_rejected/);
assert.match(qaSource, /user\.id !== qaUser\.userId/);
assert.match(qaSource, /Max-Age=.*HttpOnly; SameSite=/);
assert.doesNotMatch(qaSource, /QA_AUTH_HARNESS_PRODUCTION_ENABLED/);
assert.doesNotMatch(qaSource, /updateUserById|signInWithPassword|temporaryPassword/);

const isolationModule = loadTypeScriptModule(read("src/lib/security/supabase-isolation.ts"));
assert.equal(isolationModule.deriveSupabaseProjectRef("http://127.0.0.1:54321"), "local");
assert.equal(isolationModule.deriveSupabaseProjectRef("http://[::1]:54321"), "local");
assert.equal(isolationModule.deriveSupabaseProjectRef("https://isolated-ref.supabase.co"), "isolated-ref");
assert.equal(isolationModule.deriveSupabaseProjectRef("https://prod.supabase.co.attacker.example"), null);
assert.equal(isolationModule.deriveSupabaseProjectRef("https://isolated-ref.supabase.co/alternate"), null);
assert.equal(isolationModule.deriveSupabaseProjectRef("https://isolated-ref.supabase.co?redirect=1"), null);
assert.equal(isolationModule.deriveSupabaseProjectRef("https://isolated-ref.supabase.co:8443"), null);
assert.equal(
  isolationModule.isExactIsolatedSupabaseProject({
    supabaseUrl: "https://isolated-ref.supabase.co",
    expectedProjectRef: "isolated-ref",
  }),
  true,
);
assert.equal(
  isolationModule.isExactIsolatedSupabaseProject({
    supabaseUrl: "https://production-ref.supabase.co",
    expectedProjectRef: "isolated-ref",
  }),
  false,
);

const envProcess = { env: {} };
const deploymentTargetModule = loadTypeScriptModule(read("src/lib/deployment-target.ts"), {
  process: envProcess,
});
const envModule = loadTypeScriptModule(read("src/lib/env.ts"), {
  process: envProcess,
  dependencies: new Map([["@/lib/deployment-target", deploymentTargetModule]]),
});
for (const weakSecret of [
  "short",
  "replace-with-a-long-random-secret",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "your_secret_key_that_is_not_authoritative",
]) {
  assert.equal(envModule.isStrongSecretValue(weakSecret), false, `accepted weak secret: ${weakSecret}`);
}
const strongSecret = "2vQ!8bL#4xN@7cR$9mT%5kP&3sW*6jH+1dF=0zY";
assert.equal(envModule.isStrongSecretValue(strongSecret), true);
envProcess.env = {
  INTERNAL_SYSTEM_JOBS_SECRET: "replace-with-a-long-random-secret",
  CRON_SECRET: "short",
  VERCEL_CRON_SECRET: strongSecret,
};
assert.deepEqual(envModule.getInternalSystemJobSecrets(), [strongSecret]);
envProcess.env = {
  META_APP_ID: "app",
  META_APP_SECRET: "meta-app-secret-is-separate",
  META_REDIRECT_URI: "https://app.example.test/callback",
  META_TOKEN_ENCRYPTION_KEY: "replace-with-a-long-random-secret",
};
assert.equal(envModule.getMetaEnv(), null);
envProcess.env.META_TOKEN_ENCRYPTION_KEY = strongSecret;
assert.equal(envModule.getMetaEnv().encryptionKey, strongSecret);

const stripeCommonEnv = {
  STRIPE_WEBHOOK_SECRET: "whsec_live_fixture",
  STRIPE_STARTER_PRICE_ID: "price_live_starter",
  STRIPE_PRO_PRICE_ID: "price_live_pro",
  STRIPE_GROWTH_PRICE_ID: "price_live_growth",
  STRIPE_TEST_WEBHOOK_SECRET: "whsec_test_fixture",
  STRIPE_TEST_STARTER_PRICE_ID: "price_test_starter",
  STRIPE_TEST_PRO_PRICE_ID: "price_test_pro",
  STRIPE_TEST_GROWTH_PRICE_ID: "price_test_growth",
};
envProcess.env = {
  ...stripeCommonEnv,
  NODE_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "production",
  STRIPE_SECRET_KEY: "sk_test_production_must_reject",
};
assert.equal(envModule.getStripeEnv(), null, "production accepted a Stripe test key");
envProcess.env.STRIPE_SECRET_KEY = "rk_live_production_fixture";
assert.equal(
  envModule.getStripeEnv(),
  null,
  "repository-authored production metadata established live billing authority",
);
assert.equal(envModule.getStripeAccessKeyPrefix(), null);
envProcess.env = {
  ...stripeCommonEnv,
  NODE_ENV: "development",
  VERCEL_ENV: "production",
  STRIPE_FORCE_TEST_MODE: "true",
  STRIPE_TEST_SECRET_KEY: "sk_test_sentinel_vercel_production_must_reject",
};
assert.equal(envModule.getStripeEnv(), null, "Vercel production accepted forced Stripe test mode");
envProcess.env = {
  ...stripeCommonEnv,
  NODE_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
  STRIPE_FORCE_TEST_MODE: "true",
  STRIPE_TEST_SECRET_KEY: "rk_test_sentinel_production_build_staging_fixture",
};
assert.equal(
  envModule.getStripeEnv().mode,
  "test",
  "an explicitly attested staging deployment could not use Stripe test mode after a production build",
);
envProcess.env = {
  ...stripeCommonEnv,
  NODE_ENV: "production",
  STRIPE_FORCE_TEST_MODE: "true",
  STRIPE_TEST_SECRET_KEY: "rk_test_sentinel_unknown_target_must_reject",
};
assert.equal(
  envModule.getStripeEnv(),
  null,
  "a production build without explicit deployment authority enabled Stripe test mode",
);
envProcess.env = {
  ...stripeCommonEnv,
  NODE_ENV: "development",
  STRIPE_FORCE_TEST_MODE: "true",
  STRIPE_TEST_SECRET_KEY: "rk_test_isolated_fixture",
};
assert.equal(envModule.getStripeEnv().mode, "test");
assert.equal(envModule.getStripeEnv().livemode, false);
assert.equal(envModule.getStripeAccessKeyPrefix(), "df_test");
envProcess.env.STRIPE_TEST_SECRET_KEY = "sk_live_wrong_slot_fixture";
assert.equal(envModule.getStripeEnv(), null, "isolated Stripe test mode accepted a live key");
assert.equal(envModule.getStripeAccessKeyPrefix(), null);
envProcess.env = {
  ...stripeCommonEnv,
  NODE_ENV: "development",
  STRIPE_SECRET_KEY: "sk_test_sentinel_implicit_mode_must_reject",
};
assert.equal(envModule.getStripeEnv(), null, "implicit nonproduction Stripe test mode was accepted");

const internalRunnerSource = read("src/app/api/internal/system-jobs/route.ts");
assert.match(internalRunnerSource, /internal-system-jobs-auth/);
assert.match(internalRunnerSource, /authorization_rejected/);
assert.match(internalRunnerSource, /consumeRateLimit\(/);

const pixelConsent = loadTypeScriptModule(read("src/lib/meta-pixel-consent.ts"));
const pixelEnv = {
  ALLOW_META_PIXEL_EVENTS: "true",
  META_PIXEL_CONSENT_POLICY_VERSION: "policy-2026-07",
};
assert.equal(pixelConsent.isMetaPixelTrackingAllowed({ env: pixelEnv }), false);
assert.equal(
  pixelConsent.getMetaPixelConsentPolicyVersion({
    META_PIXEL_CONSENT_POLICY_VERSION: "unsafe; Path=/",
  }),
  null,
);
assert.equal(
  pixelConsent.isMetaPixelTrackingAllowed({
    env: pixelEnv,
    cookieValue: "granted:older-policy",
  }),
  false,
);
assert.equal(
  pixelConsent.isMetaPixelTrackingAllowed({
    env: { ...pixelEnv, ALLOW_META_PIXEL_EVENTS: "false" },
    cookieValue: "granted:policy-2026-07",
  }),
  false,
);
assert.equal(
  pixelConsent.isMetaPixelTrackingAllowed({
    env: pixelEnv,
    cookieValue: "granted:policy-2026-07",
  }),
  true,
);
const pixelConsentControlSource = read("src/components/privacy/meta-pixel-consent-control.tsx");
assert.match(pixelConsentControlSource, /Allow Meta Pixel/);
assert.match(pixelConsentControlSource, /Keep it off/);
assert.match(pixelConsentControlSource, /Privacy choices/);
assert.match(pixelConsentControlSource, /window\.location\.reload\(\)/);

const turnstileProcess = { env: { NODE_ENV: "production" } };
const turnstileDeploymentModule = loadTypeScriptModule(read("src/lib/deployment-target.ts"), {
  process: turnstileProcess,
});
const turnstileModule = loadTypeScriptModule(read("src/lib/security/turnstile.ts"), {
  process: turnstileProcess,
  dependencies: new Map([["@/lib/deployment-target", turnstileDeploymentModule]]),
});
assert.equal(
  turnstileModule.evaluateLeadCaptureTurnstileResponse({
    response: { success: true, hostname: "app.example.test", action: "lead_capture" },
    allowedHostnames: ["app.example.test"],
  }),
  true,
);
for (const response of [
  { success: true, hostname: "evil.example", action: "lead_capture" },
  { success: true, hostname: "app.example.test", action: "login" },
  { success: false, hostname: "app.example.test", action: "lead_capture" },
]) {
  assert.equal(
    turnstileModule.evaluateLeadCaptureTurnstileResponse({
      response,
      allowedHostnames: ["app.example.test"],
    }),
    false,
  );
}
turnstileProcess.env = {
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://app.example.test",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
};
await assert.rejects(
  () => turnstileModule.verifyLeadCaptureTurnstile({ token: "candidate-token" }),
  (error) => error instanceof TestApiError && error.code === "lead_turnstile_configuration_missing",
);
turnstileProcess.env = {
  NODE_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "staging",
  NEXT_PUBLIC_APP_URL: "https://app.example.test",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
};
const verifiedStagingTurnstile = await turnstileModule.verifyLeadCaptureTurnstile({
  token: "XXXX.DUMMY.TOKEN.XXXX",
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        success: true,
        hostname: "example.com",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
});
assert.deepEqual(verifiedStagingTurnstile, { required: true, verified: true });
turnstileProcess.env = {
  NODE_ENV: "production",
  DEALFLOW_DEPLOYMENT_TARGET: "production",
  NEXT_PUBLIC_APP_URL: "https://app.example.test",
};
turnstileProcess.env.TURNSTILE_SECRET_KEY = strongSecret;
await assert.rejects(
  () => turnstileModule.verifyLeadCaptureTurnstile({
    token: "candidate-token",
    remoteIp: "203.0.113.20",
    fetchImpl: async () => {
      throw new Error("an unattested production target must fail before provider access");
    },
  }),
  (error) =>
    error instanceof TestApiError &&
    error.code === "lead_turnstile_configuration_missing",
);

const twilioSource = read("src/app/api/sms/twilio/route.ts");
const twilioTestSource = twilioSource
  .replace("function parseInboundNumberOrganizationMap(", "export function parseInboundNumberOrganizationMap(")
  .replace("function resolveInboundOrganizationId(", "export function resolveInboundOrganizationId(");
const twilioProcess = { env: {} };
const twilioModule = loadTypeScriptModule(twilioTestSource, { process: twilioProcess });
const organizationA = "11111111-1111-4111-8111-111111111111";
const organizationB = "22222222-2222-4222-8222-222222222222";
twilioProcess.env = {
  TWILIO_INBOUND_NUMBER_ORGANIZATION_MAP: JSON.stringify({ "+1 (416) 555-0100": organizationA }),
};
assert.equal(twilioModule.resolveInboundOrganizationId("+14165550100"), organizationA);
assertThrowsCode(
  () => twilioModule.resolveInboundOrganizationId("+14165550101"),
  "sms_tenant_mapping_unresolved",
);
twilioProcess.env = { TWILIO_INBOUND_ORGANIZATION_ID: organizationB };
assert.equal(twilioModule.resolveInboundOrganizationId("+14165550100"), organizationB);
twilioProcess.env = {
  TWILIO_INBOUND_NUMBER_ORGANIZATION_MAP: JSON.stringify({ "+14165550100": organizationA }),
  TWILIO_INBOUND_ORGANIZATION_ID: organizationB,
};
assertThrowsCode(
  () => twilioModule.resolveInboundOrganizationId("+14165550100"),
  "sms_tenant_mapping_ambiguous",
);
twilioProcess.env = { TWILIO_INBOUND_NUMBER_ORGANIZATION_MAP: "not-json" };
assertThrowsCode(
  () => twilioModule.resolveInboundOrganizationId("+14165550100"),
  "sms_tenant_mapping_invalid",
);
twilioProcess.env = {};
assertThrowsCode(
  () => twilioModule.resolveInboundOrganizationId("+14165550100"),
  "sms_tenant_mapping_missing",
);
const signatureCheckIndex = twilioSource.indexOf("!validateTwilioWebhookSignature({");
const firstRateLimitIndex = twilioSource.indexOf("await consumeRateLimit({");
assert.ok(signatureCheckIndex >= 0 && signatureCheckIndex < firstRateLimitIndex);
assert.match(twilioSource, /twilio:webhook:authenticated-destination/);
assert.match(twilioSource, /PERMANENT_TENANT_MAPPING_ERROR_CODES/);
assert.match(twilioSource, /return twiml\(undefined, error instanceof ApiError \? Math\.max\(500, error\.status\) : 503\)/);
assert.doesNotMatch(twilioSource, /server failures are acknowledged[\s\S]{0,160}return twiml\(\)/i);

const leadHandlerSource = read("src/lib/services/lead-handler-service.ts");
assert.match(leadHandlerSource, /claim_inbound_sms_receipt/);
assert.match(leadHandlerSource, /settle_inbound_sms_receipt/);
assert.match(leadHandlerSource, /complete_inbound_sms_compliance_receipt/);
assert.match(leadHandlerSource, /status: "completed"/);
assert.match(leadHandlerSource, /blocked: true/);
const twilioLeadHandlerSource = leadHandlerSource.slice(
  leadHandlerSource.indexOf("export async function handleIncomingMessageByPhone("),
  leadHandlerSource.indexOf("export async function createLeadAndStartConversation("),
);
assert.doesNotMatch(
  twilioLeadHandlerSource,
  /generateResponse|bookAppointment|sendLeadSMS|saveLeadMessage|\.from\("leads"\)\.update/,
);

const leadCaptureSource = read("src/app/api/lead-capture/route.ts");
assert.match(leadCaptureSource, /LOAD_TEST_ISOLATED_SUPABASE_PROJECT_REF/);
assert.match(leadCaptureSource, /X-DealFlow-Load-Test-Backend/);
assert.match(leadCaptureSource, /isolated-provider-off/);
assert.match(leadCaptureSource, /process\.env\.NODE_ENV !== "production"/);
assert.match(leadCaptureSource, /providersDisabled/);

const proxySource = read("src/proxy.ts");
const proxyModule = loadTypeScriptModule(proxySource);
assert.deepEqual(proxyModule.config.matcher, ["/:path*"]);
assert.doesNotMatch(proxyModule.config.matcher[0], /svg|png|jpg|jpeg|gif|webp/);
assert.match(proxySource, /rawPathname === "\/_next"/);
assert.match(proxySource, /rawPathname\.startsWith\("\/_next\/"\)/);
assert.match(proxySource, /stripStagingAccessCredentials\(new Headers\(request\.headers\)\)/);
for (const asset of ["/file.svg", "/globe.svg", "/logo-icon.svg", "/logo.svg", "/next.svg", "/vercel.svg", "/window.svg"]) {
  assert.ok(proxySource.includes(`"${asset}"`), `${asset} must remain explicitly public`);
}
assert.match(proxySource, /getIsolatedLoopbackSupabaseOrigin/);
assert.match(proxySource, /\["localhost", "127\.0\.0\.1", "\[::1\]"\]/);
assert.match(proxySource, /isProductionBuild && !isExplicitNonProductionDeployment\(\)/);

const layoutSource = read("src/app/(app)/layout.tsx");
assert.doesNotMatch(layoutSource, /x-dealflow-auth-state/);
assert.match(layoutSource, /if \(!appContext\)/);

const apiRouteSource = read("src/lib/api/route.ts");
assert.match(
  apiRouteSource,
  /isProduction && error\.status >= 500 \? "Unexpected server error\." : error\.message/,
);

const envValues = new Map(
  read(".env.example")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const splitAt = line.indexOf("=");
      return [line.slice(0, splitAt), line.slice(splitAt + 1)];
    }),
);
for (const flag of [
  "QA_AUTH_HARNESS_ENABLED",
  "ALLOW_AI_TEXT_GENERATION",
  "ALLOW_OPENAI_IMAGE_GENERATION",
  "ALLOW_HEYGEN_VIDEO_GENERATION",
  "ALLOW_HEYGEN_LEGACY_FALLBACK",
  "ALLOW_HIGGSFIELD_VIDEO_GENERATION",
  "ALLOW_ELEVENLABS_VOICE_GENERATION",
  "ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT",
  "ENABLE_DEMO_WORKSPACE_SEEDING",
  "ENABLE_STRUCTURED_INFO_LOGS",
  "ALLOW_META_LIVE_LAUNCH",
  "ALLOW_META_LAUNCH_INTERRUPTION_TESTS",
  "ENABLE_META_LAUNCH_TEST_MODE",
  "ALLOW_BILLING_ADMIN_OVERRIDE",
  "ALLOW_QA_BILLING_ACCEPTANCE_OVERRIDE",
  "ENABLE_ACCESS_KEY_CHECKOUT",
  "ACCESS_KEY_PUBLIC_CHECKOUT_ENABLED",
  "STRIPE_FORCE_TEST_MODE",
  "STRIPE_TEST_HARNESS_ENABLED",
  "SUPPORT_STAGING_SINK_ENABLED",
  "LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED",
  "LOAD_TEST_ALLOW_SYNTHETIC_LEAD_CAPTURE",
  "ACCOUNT_DELETION_EXECUTION_ENABLED",
  "ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED",
  "GHL_ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED",
]) {
  assert.equal(envValues.get(flag), "false", `${flag} must be present and default closed`);
}
assert.equal(envValues.get("BILLING_CHECKOUT_SAFE_MODE"), "true");
assert.equal(envValues.has("QA_AUTH_HARNESS_PRODUCTION_ENABLED"), false);
assert.equal(envValues.get("GHL_IFRAME_EMBED_ENABLED"), "false");
assert.equal(envValues.get("GHL_IFRAME_ALLOW_SHARED_HIGHLEVEL_ORIGINS"), "false");
assert.equal(envValues.get("GHL_IFRAME_PARTNER_PARENT_ORIGINS_JSON"), "{}");
assert.equal(envValues.get("GHL_APP_SHARED_SECRET"), "");
assert.equal(envValues.get("PUBLIC_CLIENT_ERROR_TELEMETRY_ENABLED"), "false");
assert.equal(envValues.get("QA_ISOLATED_SUPABASE_PROJECT_REF"), "");
assert.equal(envValues.get("LOAD_TEST_ISOLATED_SUPABASE_PROJECT_REF"), "");

const rejectedLoad = spawnSync(process.execPath, ["scripts/load-test.mjs", "routes"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, LOAD_BASE_URL: "https://example.com", LOAD_REQUESTS: "0" },
});
assert.equal(rejectedLoad.status, 1);
assert.match(rejectedLoad.stderr, /Refusing non-loopback load target/);

const rejectedUnattestedLeadLoad = spawnSync(
  process.execPath,
  ["scripts/load-test.mjs", "lead-capture"],
  {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      LOAD_BASE_URL: "http://127.0.0.1:3000",
      LOAD_REQUESTS: "1",
      LOAD_TEST_ALLOW_SYNTHETIC_LEAD_CAPTURE: "true",
      LOAD_TEST_CAMPAIGN_ID: "11111111-1111-4111-8111-111111111111",
      LEAD_CAPTURE_LOAD_TEST_SECRET: "test-only-secret-with-at-least-32-characters",
      LOAD_TEST_ISOLATED_SUPABASE_PROJECT_REF: "",
    },
  },
);
assert.equal(rejectedUnattestedLeadLoad.status, 1);
assert.match(
  rejectedUnattestedLeadLoad.stderr,
  /LOAD_TEST_ISOLATED_SUPABASE_PROJECT_REF is required/,
);
const acceptedLoopback = spawnSync(process.execPath, ["scripts/load-test.mjs", "routes"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, LOAD_BASE_URL: "http://127.0.0.1:39999", LOAD_REQUESTS: "0" },
});
assert.equal(acceptedLoopback.status, 1);
assert.match(acceptedLoopback.stderr, /exact zero-external-effects load attestation is required/);

console.log("PASS security/config truth tranche");
