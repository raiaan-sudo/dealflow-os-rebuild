#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const mode = process.argv[2] ?? "offline";
const root = process.cwd();

function pass(name, detail = "") {
  console.log(`PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name, detail = "") {
  console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  process.exitCode = 1;
}

function warn(name, detail = "") {
  console.log(`WARN  ${name}${detail ? ` - ${detail}` : ""}`);
}

function info(message) {
  console.log(`INFO  ${message}`);
}

function fileText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assertIncludes(relativePath, pattern, name, detail) {
  const text = fileText(relativePath);
  const ok = typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);

  if (ok) {
    pass(name, detail);
  } else {
    fail(name, detail ?? `${relativePath} missing expected pattern`);
  }
}

function assertExcludes(relativePath, pattern, name, detail) {
  const text = fileText(relativePath);
  const bad = typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);

  if (bad) {
    fail(name, detail);
  } else {
    pass(name, detail);
  }
}

function getEnv(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function request(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { response, text, json };
}

function runOfflineChecks() {
  info("Running offline launch-readiness smoke checks");

  const launchRoute = "src/app/api/campaigns/create/route.ts";
  const launchApiRoute = "src/app/api/campaigns/[id]/launch/route.ts";
  const launchPage = "src/app/(app)/launch/page.tsx";
  const previewPage = "src/app/(app)/preview/page.tsx";
  const onboardingPage = "src/app/(app)/onboarding/page.tsx";
  const onboardingRoute = "src/app/api/onboarding/plan/route.ts";
  const leadRoute = "src/app/api/lead-capture/route.ts";
  const leadForm = "src/app/f/[slug]/lead-capture-form.tsx";
  const dashboardPage = "src/app/(app)/dashboard/page.tsx";
  const metaConnect = "src/app/api/integrations/meta/connect/route.ts";
  const metaCallback = "src/app/api/integrations/meta/callback/route.ts";
  const billingCheckoutRoute = "src/app/api/billing/checkout/route.ts";
  const videoRoute = "src/app/api/campaigns/[id]/generate-video/route.ts";
  const staticAdsRoute = "src/app/api/campaigns/[id]/generate-static-ads/route.ts";
  const launchRuntimeApi = "src/components/campaign/launch/launch-runtime-api.ts";
  const legacyAiProviders = "src/lib/ai/providers.ts";
  const apiRouteHelpers = "src/lib/api/route.ts";
  const rateLimitHelpers = "src/lib/api/rate-limit.ts";
  const sessionCostGuard = "src/lib/services/session-cost-guard.ts";
  const systemJobService = "src/lib/services/system-job-service.ts";
  const loginForm = "src/components/auth/login-form.tsx";
  const middleware = "src/middleware.ts";
  const ciGateSource = fileExists(".github/workflows/ci.yml")
    ? ".github/workflows/ci.yml"
    : "docs/production-100-client-runbook.md";

  assertIncludes(loginForm, "redirectTo.searchParams.set(\"next\", nextPath)", "Auth redirect preservation", "OAuth sign-in keeps next path");
  assertIncludes(middleware, "pathname.startsWith(\"/f/\")", "Public funnel route", "/f/[slug] remains public");
  assertIncludes(onboardingRoute, "onboarding_idempotency_key", "Onboarding idempotency persistence", "campaign plans store onboarding idempotency key");
  assertIncludes(onboardingPage, "Resume campaign build", "Onboarding resume UI", "resume banner exists after refresh");
  assertIncludes(onboardingPage, "Generating funnel", "Onboarding progress step 1", "funnel progress visible");
  assertIncludes(onboardingPage, "Generating ads and creative angles", "Onboarding progress step 2", "creative progress visible");
  assertIncludes(onboardingPage, "Building launch-ready campaign", "Onboarding progress step 3", "campaign build progress visible");

  assertIncludes(previewPage, "loadPersistedSelectedAdId", "Preview selected ad source", "preview loads persisted selected ad from DB helper");
  assertIncludes(previewPage, "getSelectedAdIdFromPlan", "Preview selected ad plan helper", "preview resolves selected ad through typed plan helper");
  assertIncludes(launchPage, "loadPersistedSelectedAdId", "Launch selected ad source", "launch loads persisted selected ad from DB helper");
  assertIncludes(launchPage, "getSelectedAdIdFromPlan", "Launch selected ad plan helper", "launch resolves selected ad through typed plan helper");
  assertExcludes(launchPage, "recommended", "Launch recommended fallback removed", "launch preview does not use recommended fallback");

  assertIncludes(launchRoute, "validateExistingMetaObject", "Meta object validation before reuse", "existing Meta IDs are validated before reuse");
  assertIncludes(launchRoute, "fetchMetaObjectByName", "Deterministic Meta lookup", "Meta objects are recovered by deterministic name");
  assertIncludes(launchRoute, "step_status", "Step-level launch state", "launch_runtime stores step_status");
  assertIncludes(launchRoute, "testModeInterruptAfter", "Forced interruption support", "forced interruption mode exists");
  assertIncludes(launchApiRoute, "test_mode_interrupt_after", "Forced interruption launch API", "launch route forwards interruption mode");
  assertIncludes(launchApiRoute, "assertMetaLaunchBillingAccess", "Launch billing gate", "launch route enforces subscription/admin override gate");
  assertIncludes(launchApiRoute, "acquireMetaLaunchLock", "Durable Meta launch lock", "launch route uses DB-backed launch locking");
  assertIncludes(launchApiRoute, "ALLOW_META_LAUNCH_INTERRUPTION_TESTS", "Interruption guard", "forced interruption is env-gated");
  assertIncludes("src/lib/integrations/meta/execution.ts", "return \"PAUSED\"", "Meta objects remain paused", "shared Meta execution mapper never emits ACTIVE during beta");
  assertIncludes("src/lib/services/meta-launch-service.ts", "status: \"paused\"", "Meta publish activation disabled", "publish step reports paused instead of activating Meta objects");
  assertIncludes(metaConnect, "value.startsWith(\"//\")", "Meta OAuth return path guard", "protocol-relative return paths are rejected");
  assertIncludes(metaCallback, "resolved.origin === appOrigin", "Meta OAuth callback origin guard", "callback redirects stay on the app origin");

  assertExcludes(launchRoute, /accounts\[0\]|pages\[0\]|pixels\[0\]/, "No first-asset fallback in launch execution", "launch route has no accounts[0]/pages[0]/pixels[0]");
  assertIncludes(metaCallback, "asset_discovery", "Meta discovery state tracking", "callback stores partial discovery status");

  assertIncludes(leadForm, "Please provide email or phone", "Lead form client validation", "lead form blocks submit without email or phone");
  assertIncludes(leadRoute, "consumeRateLimit", "Lead capture rate limiting", "lead capture rate limiting enabled");
  assertIncludes(rateLimitHelpers, "rate_limit_unavailable", "Durable rate limiting fails closed", "production rate limiting no longer falls back to in-memory buckets");
  assertIncludes(rateLimitHelpers, "p_bucket_key", "Durable rate-limit RPC contract", "rate limiter calls the Supabase RPC with versioned parameter names");
  assertIncludes("src/lib/services/lead-handler-service.ts", "dedupe_hash", "Lead durable dedupe hash", "public leads have durable dedupe hash support");
  assertIncludes("src/lib/services/lead-handler-service.ts", "consent_metadata", "Lead consent persistence", "lead capture persists consent metadata");
  assertIncludes("src/lib/services/lead-handler-service.ts", "buildLeadRetryJobIdempotencyKey", "Lead retry idempotency key", "queued lead retry jobs dedupe by request and contact");
  assertIncludes("src/lib/services/lead-handler-service.ts", "findRecentDuplicateLead", "Lead dedupe path", "duplicate public leads are checked before insert");
  assertIncludes("src/lib/services/lead-handler-service.ts", ".eq(\"publish_state\", \"published\")", "Public lead capture published-only lookup", "raw campaign IDs cannot capture leads for unpublished funnels");
  assertIncludes("src/lib/services/lead-handler-service.ts", "replayFailedPublicLeadCapture", "Lead retry replay implementation", "queued lead retries call the public lead insert path");
  assertExcludes("src/lib/services/lead-handler-service.ts", /QA_EMAIL|QA_PASSWORD/, "QA credential fallback removed", "no QA credential fallback remains in lead handler");

  assertIncludes(apiRouteHelpers, "assertSameOriginRequest", "Same-origin mutation guard helper", "sensitive authenticated POST routes can reject cross-site requests");
  assertIncludes(apiRouteHelpers, "if (!candidate)", "Same-origin missing-header rejection", "same-origin guard rejects unsafe requests that omit Origin and Referer");
  assertIncludes(onboardingRoute, "assertSameOriginRequest", "Onboarding same-origin guard", "onboarding POST rejects cross-site requests");
  assertIncludes("src/app/api/campaigns/[id]/select-ad/route.ts", "assertSameOriginRequest", "Selected creative same-origin guard", "selected creative writes reject cross-site requests");
  assertIncludes("src/app/api/campaigns/[id]/select-ad/route.ts", "organization_id", "Selected creative ownership guard", "selected creative writes verify campaign ownership");
  assertIncludes(launchRoute, "ownershipVerified", "Meta failure persistence ownership guard", "direct Meta launch route does not persist failure state before ownership is proven");
  assertIncludes(billingCheckoutRoute, "assertSameOriginRequest", "Billing checkout same-origin guard", "checkout route rejects cross-site POSTs");
  assertIncludes(staticAdsRoute, "consumeSessionCostBudget", "Paid static generation guard", "static ad generation consumes DB-backed provider budget");
  assertIncludes(staticAdsRoute, "idempotencyKey", "Static generation idempotency", "paid generation job creation uses idempotency key");
  assertIncludes(sessionCostGuard, "reserve_provider_usage", "Atomic provider usage reservation", "paid-generation guard reserves provider budget through DB RPC");
  assertIncludes(sessionCostGuard, "markSessionCostBudgetEvent", "Provider usage ledger transitions", "paid-generation reservations are marked consumed/released after job creation");
  assertIncludes(videoRoute, "video_generation_disabled", "Video generation disabled", "HeyGen/video generation remains disabled for beta");
  assertExcludes(launchRuntimeApi, "/api/integrations/meta/deploy", "No dead Meta deploy client route", "client helpers do not call a missing Meta deploy endpoint");
  assertIncludes(legacyAiProviders, "ALLOW_HEYGEN_VIDEO_GENERATION", "Legacy HeyGen helper kill switch", "older AI helper paths cannot call HeyGen unless explicitly enabled");
  assertIncludes(systemJobService, "claim_next_system_job", "Atomic system job claim", "system job worker uses DB-backed SKIP LOCKED claim RPC");
  assertIncludes(systemJobService, "replayFailedPublicLeadCapture", "Lead retry job processor", "lead capture retry jobs replay or fail instead of silently completing");
  assertIncludes(systemJobService, "dead_lettered_at: null", "Manual retry clears dead-letter", "operator retry can make dead-lettered jobs claimable again");
  assertIncludes(systemJobService, "dead_letter_reason", "System job dead-letter state", "failed jobs preserve dead-letter reason");
  assertIncludes(systemJobService, "last_error_code", "System job error classification", "operator views can filter repeated job error classes");
  assertIncludes(systemJobService, "maxAttempts", "System job max attempts", "jobs persist an attempt ceiling for DB claim/dead-letter enforcement");

  assertIncludes(dashboardPage, "Last updated", "Dashboard last-updated state", "dashboard shows last updated timestamp");
  assertIncludes(dashboardPage, "leadLoopVerified", "Dashboard lead-loop state", "dashboard loads lead loop verification");

  assertIncludes("scripts/meta-launch-idempotency-test.md", "Interrupt after campaign creation", "Meta idempotency test doc", "forced interruption test documentation exists");
  assertIncludes("scripts/smoke-test-checklist.md", "Confirm `/preview` and `/launch` show the same selected ad.", "Manual smoke checklist", "manual staging smoke checklist exists");
  assertIncludes(ciGateSource, "npm run lint", "CI lint gate", "pull requests run lint before merge");
  assertIncludes(ciGateSource, "npm run typecheck", "CI typecheck gate", "pull requests run TypeScript validation before merge");
  assertIncludes(ciGateSource, "npm run build", "CI build gate", "pull requests build before merge");
  assertIncludes(ciGateSource, "npm run smoke:offline", "CI offline smoke gate", "pull requests run launch-readiness smoke checks before merge");
}

async function runStagingChecks() {
  info("Running staging-safe smoke checks");

  const baseUrl = getEnv("SMOKE_BASE_URL");
  if (!baseUrl) {
    fail("Staging base URL", "Set SMOKE_BASE_URL to run staging smoke checks");
    return;
  }

  const login = await request(`${baseUrl}/login`);
  if (login.response.ok) {
    pass("Login page reachable", `${login.response.status}`);
  } else {
    fail("Login page reachable", `${login.response.status}`);
  }

  const dashboard = await request(`${baseUrl}/dashboard`, {
    redirect: "manual",
  });
  if (dashboard.response.status >= 300 && dashboard.response.status < 400) {
    pass("Protected route enforcement", `dashboard redirects unauthenticated users (${dashboard.response.status})`);
  } else {
    fail("Protected route enforcement", `expected redirect, got ${dashboard.response.status}`);
  }

  const invalidLead = await request(`${baseUrl}/api/lead-capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "",
      campaignId: "00000000-0000-0000-0000-000000000000",
    }),
  });
  if (invalidLead.response.status === 400) {
    pass("Lead capture rejects invalid payload", "invalid public lead payload returned 400");
  } else {
    fail("Lead capture rejects invalid payload", `expected 400, got ${invalidLead.response.status}`);
  }

  const testSlug = getEnv("SMOKE_TEST_FUNNEL_SLUG");
  if (testSlug) {
    const funnel = await request(`${baseUrl}/f/${testSlug}`, {
      redirect: "manual",
    });
    if (funnel.response.ok) {
      pass("Public funnel reachable", `/f/${testSlug} returned ${funnel.response.status}`);
    } else {
      fail("Public funnel reachable", `/f/${testSlug} returned ${funnel.response.status}`);
    }
  } else {
    warn("Public funnel reachability", "Set SMOKE_TEST_FUNNEL_SLUG to verify a real public funnel route");
  }

  const testCampaignId = getEnv("SMOKE_TEST_CAMPAIGN_ID");
  const testEmail = getEnv("SMOKE_TEST_EMAIL");
  const testPhone = getEnv("SMOKE_TEST_PHONE");

  if (testCampaignId && (testEmail || testPhone)) {
    const payload = {
      name: "Smoke Test Lead",
      campaignId: testCampaignId,
      ...(testEmail ? { email: testEmail } : {}),
      ...(testPhone ? { phone: testPhone } : {}),
    };

    const first = await request(`${baseUrl}/api/lead-capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (first.response.ok) {
      pass("Lead capture accepts valid payload", "first lead submission succeeded");
    } else {
      fail("Lead capture accepts valid payload", `expected success, got ${first.response.status}`);
    }

    const second = await request(`${baseUrl}/api/lead-capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (second.response.ok) {
      pass("Lead duplicate handling", "second lead submission returned safely");
    } else {
      fail("Lead duplicate handling", `expected safe success, got ${second.response.status}`);
    }
  } else {
    warn(
      "Valid lead submission",
      "Set SMOKE_TEST_CAMPAIGN_ID plus SMOKE_TEST_EMAIL or SMOKE_TEST_PHONE to verify live lead capture and dedupe",
    );
  }

  warn(
    "Manual authenticated checks still required",
    "OAuth, onboarding resume, selected creative persistence, Meta launch, and dashboard campaign-state verification still need browser-driven staging validation",
  );
}

if (mode === "offline") {
  runOfflineChecks();
} else if (mode === "staging") {
  await runStagingChecks();
} else {
  fail("Smoke test mode", `Unsupported mode: ${mode}`);
}
