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
  const builderPage = "src/app/(app)/builder/page.tsx";
  const onboardingPage = "src/app/(app)/onboarding/page.tsx";
  const onboardingRoute = "src/app/api/onboarding/plan/route.ts";
  const leadRoute = "src/app/api/lead-capture/route.ts";
  const leadForm = "src/app/f/[slug]/lead-capture-form.tsx";
  const dashboardPage = "src/app/(app)/dashboard/page.tsx";
  const topBar = "src/components/layout/top-bar.tsx";
  const sidebar = "src/components/layout/sidebar.tsx";
  const systemStatus = "src/components/layout/system-status.tsx";
  const guidedFlowBanner = "src/components/layout/guided-flow-banner.tsx";
  const navigationConfig = "src/lib/navigation.ts";
  const appContextService = "src/lib/services/app-context.ts";
  const metaConnect = "src/app/api/integrations/meta/connect/route.ts";
  const metaCallback = "src/app/api/integrations/meta/callback/route.ts";
  const billingCheckoutRoute = "src/app/api/billing/checkout/route.ts";
  const billingPortalRoute = "src/app/api/billing/portal/route.ts";
  const billingService = "src/lib/services/billing-service.ts";
  const stripeService = "src/lib/integrations/stripe/service.ts";
  const stripeProvider = "src/lib/integrations/stripe/provider.ts";
  const billingWebhookMigration = "supabase/migrations/20260428140000_harden_billing_subscription_webhooks.sql";
  const billingOrderingMigration = "supabase/migrations/20260430010000_public_launch_final_hardening.sql";
  const createCampaignRoute = "src/app/api/campaigns/create/route.ts";
  const videoRoute = "src/app/api/campaigns/[id]/generate-video/route.ts";
  const staticAdsRoute = "src/app/api/campaigns/[id]/generate-static-ads/route.ts";
  const launchRuntimeApi = "src/components/campaign/launch/launch-runtime-api.ts";
  const legacyAiProviders = "src/lib/ai/providers.ts";
  const creativeEngine = "src/lib/services/creative-engine.ts";
  const campaignPersistence = "src/lib/services/campaign-persistence.ts";
  const campaignPlanPersistence = "src/lib/services/campaign-plan-persistence-service.ts";
  const directHeyGenClient = "src/lib/ai/heygen.ts";
  const apiRouteHelpers = "src/lib/api/route.ts";
  const rateLimitHelpers = "src/lib/api/rate-limit.ts";
  const twilioWebhookRoute = "src/app/api/sms/twilio/route.ts";
  const smsService = "src/lib/services/sms-service.ts";
  const leadMessageIdempotencyMigration = "supabase/migrations/20260428162000_harden_lead_message_idempotency.sql";
  const envHelpers = "src/lib/env.ts";
  const sessionCostGuard = "src/lib/services/session-cost-guard.ts";
  const creditService = "src/lib/services/credit-service.ts";
  const systemJobService = "src/lib/services/system-job-service.ts";
  const internalLaunchMonitor = "src/lib/services/internal-launch-monitor.ts";
  const metaExecution = "src/lib/integrations/meta/execution.ts";
  const metaLaunchService = "src/lib/services/meta-launch-service.ts";
  const imageProvider = "src/lib/integrations/creative/image-provider.ts";
  const loginForm = "src/components/auth/login-form.tsx";
  const middleware = "src/proxy.ts";
  const ciGateSource = fileExists(".github/workflows/ci.yml")
    ? ".github/workflows/ci.yml"
    : "docs/production-100-client-runbook.md";
  const productionRunbook = "docs/production-100-client-runbook.md";
  const membershipPolicyMigration = "supabase/migrations/20260430060000_harden_membership_insert_policy.sql";

  assertIncludes(loginForm, "redirectTo.searchParams.set(\"next\", nextPath)", "Auth redirect preservation", "OAuth sign-in keeps next path");
  assertIncludes(middleware, "pathname.startsWith(\"/f/\")", "Public funnel route", "/f/[slug] remains public");
  assertIncludes(
    middleware,
    "ROOT_APP_REDIRECT_HOSTS",
    "Root app domain routing",
    "ClickToScale and AgentDealFlow app roots route into onboarding instead of the marketing homepage",
  );
  assertIncludes(
    middleware,
    "buildRootAppRedirect",
    "Root app redirect destination",
    "root app domains redirect to the onboarding entry point while preserving query params",
  );
  assertIncludes(builderPage, "redirectUrl = new URL(\"/onboarding\"", "Legacy builder route redirect", "/builder redirects signed-in users to onboarding");
  assertExcludes(builderPage, "CampaignBuilderWorkspace", "Legacy builder workspace removed", "/builder no longer renders the old authenticated builder UI");
  assertExcludes(builderPage, "Campaign Setup", "Legacy builder page copy removed", "/builder no longer exposes the old Campaign Setup surface");
  assertExcludes(topBar, "href: \"/builder\"", "Mobile nav builder link removed", "primary mobile navigation sends Build users to onboarding");
  assertExcludes(sidebar, "href: \"/builder\"", "Sidebar builder link removed", "primary sidebar navigation sends Build users to onboarding");
  assertExcludes(dashboardPage, "buildCampaignScopedPath(\"/builder\"", "Dashboard builder link removed", "dashboard empty state cannot send users to the old builder");
  assertExcludes(previewPage, "href=\"/builder\"", "Preview builder link removed", "preview fallback cannot send users to the old builder");
  assertExcludes(previewPage, "`/builder?campaignId=", "Preview campaign builder link removed", "preview invalid state sends users back to onboarding");
  assertExcludes(systemStatus, "pathname.startsWith(\"/builder\")", "System status builder route removed", "workspace status no longer treats /builder as a primary route");
  assertExcludes(guidedFlowBanner, "pathname.startsWith(\"/builder\")", "Guided banner builder route removed", "guided banner no longer treats /builder as a primary route");
  assertExcludes(navigationConfig, "href: \"/builder\"", "Global navigation builder link removed", "shared app navigation points to onboarding");
  assertIncludes(onboardingRoute, "onboarding_idempotency_key", "Onboarding idempotency persistence", "campaign plans store onboarding idempotency key");
  assertIncludes(onboardingPage, "Resume campaign build", "Onboarding resume UI", "resume banner exists after refresh");
  assertIncludes(onboardingPage, "Generating funnel", "Onboarding progress step 1", "funnel progress visible");
  assertIncludes(onboardingPage, "Generating ads and creative angles", "Onboarding progress step 2", "creative progress visible");
  assertIncludes(onboardingPage, "Building launch-ready campaign", "Onboarding progress step 3", "campaign build progress visible");
  assertIncludes(appContextService, "isDemoWorkspaceSeedingEnabled", "Production demo seeding guard", "workspace demo data seeding is environment-gated");
  assertIncludes(appContextService, "fallbackOrganizationSlug", "Workspace slug collision guard", "bootstrap creates a user-owned fallback slug instead of recovering another owner workspace");
  assertIncludes(appContextService, "non-owned organization", "Workspace ownership bootstrap guard", "membership bootstrap refuses non-owned organizations");
  assertIncludes(membershipPolicyMigration, "drop policy if exists organization_memberships_insert_self", "Membership self-join policy removed", "authenticated users cannot self-join arbitrary organizations");

  assertIncludes(previewPage, "loadPersistedSelectedAdIds", "Preview selected creative source", "preview loads persisted selected creative set from DB helper");
  assertIncludes(previewPage, "getSelectedAdIdsFromPlan", "Preview selected creative plan helper", "preview resolves selected creative set through typed plan helper");
  assertIncludes(launchPage, "loadPersistedSelectedAdIds", "Launch selected creative source", "launch loads persisted selected creative set from DB helper");
  assertIncludes(launchPage, "getSelectedAdIdsFromPlan", "Launch selected creative plan helper", "launch resolves selected creative set through typed plan helper");
  assertExcludes(launchPage, "recommended", "Launch recommended fallback removed", "launch preview does not use recommended fallback");

  assertIncludes(launchRoute, "validateExistingMetaObject", "Meta object validation before reuse", "existing Meta IDs are validated before reuse");
  assertIncludes(launchRoute, "fetchMetaObjectByName", "Deterministic Meta lookup", "Meta objects are recovered by deterministic name");
  assertIncludes(launchRoute, "step_status", "Step-level launch state", "launch_runtime stores step_status");
  assertIncludes(launchRoute, "testModeInterruptAfter", "Forced interruption support", "forced interruption mode exists");
  assertIncludes(launchApiRoute, "test_mode_interrupt_after", "Forced interruption launch API", "launch route forwards interruption mode");
  assertIncludes(launchApiRoute, "assertCampaignCanLaunch", "Launch billing gate", "launch route enforces subscription/admin override gate");
  assertIncludes(launchApiRoute, "acquireMetaLaunchLock", "Durable Meta launch lock", "launch route uses DB-backed launch locking");
  assertIncludes(launchApiRoute, "ALLOW_META_LAUNCH_INTERRUPTION_TESTS", "Interruption guard", "forced interruption is env-gated");
  assertIncludes(metaExecution, "return \"PAUSED\"", "Meta objects remain paused", "shared Meta execution mapper never emits ACTIVE during beta");
  assertIncludes(metaExecution, "ALLOW_META_LIVE_LAUNCH", "Meta live launch kill switch", "live execution mode requires an explicit owner-controlled env flag");
  assertIncludes(metaLaunchService, "forcePausedPayload", "Direct Meta payload pause guard", "direct Meta launch creation forces PAUSED payloads");
  assertIncludes(metaLaunchService, "meta_active_status_blocked", "Direct Meta ACTIVE block", "direct Meta launch rejects active object payloads");
  assertIncludes(metaLaunchService, "status: \"paused\"", "Meta publish activation disabled", "publish step reports paused instead of activating Meta objects");
  assertIncludes(metaConnect, "value.startsWith(\"//\")", "Meta OAuth return path guard", "protocol-relative return paths are rejected");
  assertIncludes(metaCallback, "resolved.origin === appOrigin", "Meta OAuth callback origin guard", "callback redirects stay on the app origin");

  assertExcludes(launchRoute, /accounts\[0\]|pages\[0\]|pixels\[0\]/, "No first-asset fallback in launch execution", "launch route has no accounts[0]/pages[0]/pixels[0]");
  assertIncludes(metaCallback, "asset_discovery", "Meta discovery state tracking", "callback stores partial discovery status");

  assertIncludes(leadForm, "validationEmail", "Lead form email validation", "lead form requires configured email fields before submit");
  assertIncludes(leadForm, "validationPhone", "Lead form phone validation", "lead form requires configured phone fields before submit");
  assertIncludes(leadRoute, "Either an email or phone number is required.", "Lead capture contact validation", "lead capture rejects payloads without an email or phone");
  assertIncludes(leadRoute, "consumeRateLimit", "Lead capture rate limiting", "lead capture rate limiting enabled");
  assertIncludes(leadRoute, "lead-capture:campaign-ip", "Lead capture campaign+IP limit", "public lead capture rate limit is caller-aware");
  assertIncludes(leadRoute, "lead-capture:contact", "Lead capture contact limit", "public lead capture has contact-hash abuse control");
  assertIncludes(leadRoute, "lead_spam_rejected", "Lead capture honeypot/timing guard", "public lead capture rejects obvious bot submissions");
  assertExcludes(leadRoute, "TURNSTILE_SECRET_KEY", "Lead capture Turnstile removed", "public customer funnels do not require Cloudflare Turnstile server verification");
  assertExcludes(leadRoute, "https://challenges.cloudflare.com/turnstile/v0/siteverify", "Lead capture Turnstile siteverify removed", "public customer funnels do not call Cloudflare Turnstile siteverify");
  assertExcludes(leadForm, "NEXT_PUBLIC_TURNSTILE_SITE_KEY", "Lead form Turnstile client removed", "public customer funnels do not render Turnstile");
  assertIncludes(loginForm, "supabase.auth.signInWithPassword({\n          email,\n          password,\n          options:", "Signin Turnstile token support", "Supabase Auth password sign-in can receive a Turnstile token");
  assertIncludes(loginForm, "captchaToken", "Signup Turnstile token support", "Supabase Auth CAPTCHA can receive a Turnstile token during account creation");
  assertIncludes(loginForm, "resetPasswordForEmail", "Forgot password support", "login page can request a Supabase password reset link");
  assertIncludes(loginForm, "PASSWORD_RECOVERY", "Password recovery completion", "login page handles Supabase recovery sessions");
  assertIncludes(middleware, "https://challenges.cloudflare.com", "Turnstile CSP allowlist", "production CSP allows Cloudflare Turnstile script, frame, and verification traffic");
  assertIncludes(rateLimitHelpers, "rate_limit_unavailable", "Durable rate limiting fails closed", "production rate limiting no longer falls back to in-memory buckets");
  assertIncludes(rateLimitHelpers, "p_bucket_key", "Durable rate-limit RPC contract", "rate limiter calls the Supabase RPC with versioned parameter names");
  assertIncludes(apiRouteHelpers, "Request body is too large.", "API body size limit helper", "shared request parsing rejects oversized bodies");
  assertIncludes(apiRouteHelpers, "parseTextBody", "Bounded text body parser", "raw webhook/body reads are bounded");
  assertIncludes(twilioWebhookRoute, "twilio:webhook:ip", "Twilio webhook IP rate limit", "public Twilio webhook has durable caller bucket");
  assertIncludes(twilioWebhookRoute, "twilio_body_too_large", "Twilio webhook body limit", "public Twilio webhook rejects oversized bodies");
  assertIncludes(twilioWebhookRoute, "replySuppressed", "Twilio automated reply suppression", "inbound SMS webhook records when automated SMS replies are suppressed");
  assertIncludes(smsService, "outboundLeadSmsEnabled: false", "SMS outbound disabled by default", "lead-facing SMS automation remains hard-disabled");
  assertIncludes(smsService, "SMS_COMPLIANCE_ACK === \"true\"", "SMS compliance acknowledgement gate", "outbound SMS automation requires explicit compliance approval");
  assertIncludes(smsService, "lead_sms_automation_disabled", "SMS consent enforcement", "lead-facing sends are blocked instead of relying on consent state");
  assertIncludes(smsService, "Outbound SMS to leads is disabled", "SMS opt-out enforcement", "lead-facing sends cannot reach opted-out recipients because automation is disabled");
  assertIncludes(leadMessageIdempotencyMigration, "lead_messages_provider_message_unique_idx", "Lead message provider idempotency constraint", "Twilio retries cannot duplicate provider messages after migration");
  assertIncludes("src/lib/services/lead-handler-service.ts", "dedupe_hash", "Lead durable dedupe hash", "public leads have durable dedupe hash support");
  assertIncludes("src/lib/services/lead-handler-service.ts", "consent_metadata", "Lead consent persistence", "lead capture persists consent metadata");
  assertIncludes("src/lib/services/lead-handler-service.ts", "buildLeadRetryJobIdempotencyKey", "Lead retry idempotency key", "queued lead retry jobs dedupe by request and contact");
  assertIncludes("src/lib/services/lead-handler-service.ts", "findRecentDuplicateLead", "Lead dedupe path", "duplicate public leads are checked before insert");
  assertIncludes("src/lib/services/lead-handler-service.ts", ".eq(\"publish_state\", \"published\")", "Public lead capture published-only lookup", "raw campaign IDs cannot capture leads for unpublished funnels");
  assertIncludes("src/lib/services/lead-handler-service.ts", "replayFailedPublicLeadCapture", "Lead retry replay implementation", "queued lead retries call the public lead insert path");
  assertIncludes(leadRoute, "LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED", "Lead load proof gate", "production write load proof requires an explicit env gate");
  assertIncludes(leadRoute, "x-dealflow-load-test-secret", "Lead load proof secret", "production write load proof requires a server-side secret header");
  assertIncludes(systemJobService, "lead_side_effects", "Durable lead side effects", "lead notification and CAPI work is processed by durable system jobs");
  assertExcludes("src/lib/services/lead-handler-service.ts", /QA_EMAIL|QA_PASSWORD/, "QA credential fallback removed", "no QA credential fallback remains in lead handler");
  assertIncludes(campaignPlanPersistence, "organization_id: params.ownerId", "Campaign persistence organization ownership", "fresh campaign rows persist organization_id for downstream jobs and billing");
  assertIncludes("scripts/check-rls-cross-tenant.mjs", "RLS_USER_A_JWT", "Cross-tenant RLS smoke script", "operator can prove User A cannot read User B fixtures");
  assertIncludes("scripts/check-rls-cross-tenant.mjs", "expectRpcDenied", "Internal RPC denial smoke script", "operator can prove internal RPCs are not executable by anon/authenticated clients");

  assertIncludes(apiRouteHelpers, "assertSameOriginRequest", "Same-origin mutation guard helper", "sensitive authenticated POST routes can reject cross-site requests");
  assertIncludes(apiRouteHelpers, "if (!candidate)", "Same-origin missing-header rejection", "same-origin guard rejects unsafe requests that omit Origin and Referer");
  assertIncludes(middleware, "script-src-attr 'none'", "CSP inline attribute hardening", "production CSP blocks inline event-handler attributes");
  assertIncludes(middleware, "upgrade-insecure-requests", "CSP production upgrade directive", "production CSP upgrades insecure subresource requests");
  assertIncludes(middleware, "isProduction ? [] : [\"'unsafe-eval'\"]", "CSP production unsafe-eval removal", "unsafe-eval is only permitted outside production");
  assertIncludes(onboardingRoute, "assertSameOriginRequest", "Onboarding same-origin guard", "onboarding POST rejects cross-site requests");
  assertIncludes("src/app/api/campaigns/[id]/select-ad/route.ts", "assertSameOriginRequest", "Selected creative same-origin guard", "selected creative writes reject cross-site requests");
  assertIncludes("src/app/api/campaigns/[id]/select-ad/route.ts", "organization_id", "Selected creative ownership guard", "selected creative writes verify campaign ownership");
  assertIncludes(launchRoute, "ownershipVerified", "Meta failure persistence ownership guard", "direct Meta launch route does not persist failure state before ownership is proven");
  assertIncludes(createCampaignRoute, "meta_paused_verification_failed", "Direct Meta paused verification", "direct Meta launch route verifies or restores PAUSED after create/recovery");
  assertIncludes(billingCheckoutRoute, "assertSameOriginRequest", "Billing checkout same-origin guard", "checkout route rejects cross-site POSTs");
  assertIncludes(billingPortalRoute, "assertSameOriginRequest", "Billing portal same-origin guard", "portal route rejects cross-site POSTs");
  assertIncludes(stripeProvider, "create_billing_portal_session", "Stripe portal provider support", "billing portal sessions are created through the Stripe provider");
  assertIncludes(stripeService, "session_id={CHECKOUT_SESSION_ID}", "Stripe checkout success session id", "checkout success redirects carry the Stripe session id");
  assertIncludes(stripeProvider, "retrieve_checkout_session", "Stripe checkout retrieval support", "checkout sessions can be verified server-side after redirect");
  assertIncludes(billingService, "reconcileBillingCheckoutSuccess", "Stripe checkout success reconciliation", "unlock success can sync subscription state if webhooks lag");
  assertIncludes(billingService, "billing_checkout_session_reused", "Stripe checkout duplicate-session reuse", "recent open checkout sessions are reused instead of duplicated");
  assertIncludes(billingService, "checkout_session_stale", "Stripe stale checkout reconciliation guard", "older parallel checkout sessions cannot unlock access");
  assertIncludes(envHelpers, "ALLOW_BILLING_ADMIN_OVERRIDE", "Billing admin override env gate", "internal launch override requires explicit env opt-in");
  assertIncludes(billingService, "billing_admin_override_launch_access_granted", "Billing admin override audit log", "override-based launch access grants are audit logged");
  assertIncludes(billingService, "apply_billing_subscription_webhook", "Stripe webhook ordering guard", "subscription sync uses DB-backed stale event protection");
  assertIncludes(billingService, "stripe_subscription_stale_event_ignored", "Stripe stale event observability", "out-of-order subscription events are logged and ignored");
  assertIncludes(billingWebhookMigration, "stripe_latest_event_created", "Billing subscription event watermark", "billing rows persist latest Stripe event timestamps");
  assertIncludes(billingOrderingMigration, "stripe_latest_event_id, '') < normalized_event_id", "Billing equal-timestamp ordering guard", "same-second Stripe events are ordered deterministically");
  assertIncludes(creditService, "consume_user_credits", "Atomic credit deduction", "paid generation credits are deducted through a DB RPC");
  assertIncludes(creditService, "grant_user_credits", "Credit top-up ledger", "credit grants and refunds use the append-only DB ledger");
  assertIncludes(creditService, "credits_insufficient", "Insufficient credit block", "paid generation is blocked before balances can go negative");
  assertIncludes(billingService, "checkout_kind: \"credit_top_up\"", "Stripe credit top-up checkout", "credit purchases are isolated from subscription checkout metadata");
  assertIncludes(billingService, "stripe_credit_top_up_processed", "Stripe credit top-up webhook", "paid credit checkout sessions grant credits idempotently");
  assertIncludes(creativeEngine, "provider_usage_context", "Paid static generation guard", "each generated image carries DB-backed provider usage context");
  assertIncludes(campaignPersistence, "consumeSessionCostBudget", "Paid image call guard", "server-side static generation reserves provider budget before execution");
  assertIncludes(staticAdsRoute, "idempotencyKey", "Static generation idempotency", "paid generation job creation uses idempotency key");
  assertIncludes(imageProvider, "ALLOW_OPENAI_IMAGE_GENERATION !== \"true\"", "OpenAI image generation kill switch", "paid image provider returns unsupported unless explicitly enabled");
  assertIncludes(launchRoute, "assertMetaLiveLaunchEnabled", "Reachable Meta live launch kill switch", "direct Meta launch route fails closed unless ALLOW_META_LIVE_LAUNCH=true");
  assertIncludes(launchRoute, "Math.min(Math.floor(configuredCap), DEFAULT_META_DAILY_BUDGET_CAP_CENTS)", "Reachable Meta budget hard cap", "direct Meta launch route cannot raise budget above the owner-approved $2/day cap through env");
  assertIncludes(sessionCostGuard, "reserve_provider_usage", "Atomic provider usage reservation", "paid-generation guard reserves provider budget through DB RPC");
  assertIncludes(sessionCostGuard, "OPENAI_IMAGE_DAILY_LIMIT", "Configurable image cap", "OpenAI image generation can be capped below the default for production tests");
  assertIncludes(sessionCostGuard, "provider_usage_idempotency_consumed", "Paid generation duplicate-spend guard", "consumed provider usage reservations fail closed instead of calling the provider again");
  assertIncludes(sessionCostGuard, "consumeCreditsForGeneration", "Provider usage credit coupling", "provider reservations consume credits before paid calls execute");
  assertIncludes(sessionCostGuard, "refundCreditsForProviderUsageEvent", "Credit refund coupling", "released or failed paid calls refund reserved credits");
  assertIncludes(legacyAiProviders, "providerUsage?.mark", "Provider usage ledger transitions", "paid-generation reservations are marked consumed/released after the provider call");
  assertIncludes(videoRoute, "kind: \"video_generation\"", "Video generation job route", "HeyGen/video generation is queued through the paid system job path");
  assertIncludes(videoRoute, "getCampaignById", "Video generation ownership guard", "video generation verifies campaign ownership before queueing paid work");
  assertIncludes(systemJobService, "video_generation_status", "Video generation status polling", "HeyGen render completion is polled by durable follow-up jobs instead of blocking the cron worker");
  assertExcludes(launchRuntimeApi, "/api/integrations/meta/deploy", "No dead Meta deploy client route", "client helpers do not call a missing Meta deploy endpoint");
  assertIncludes(legacyAiProviders, "ALLOW_HEYGEN_VIDEO_GENERATION", "Legacy HeyGen helper kill switch", "older AI helper paths cannot call HeyGen unless explicitly enabled");
  assertIncludes(directHeyGenClient, "ALLOW_HEYGEN_VIDEO_GENERATION", "Direct HeyGen client kill switch", "queued video jobs cannot call HeyGen unless explicitly enabled");
  assertIncludes(systemJobService, "claim_next_system_job", "Atomic system job claim", "system job worker uses DB-backed SKIP LOCKED claim RPC");
  assertIncludes(systemJobService, "replayFailedPublicLeadCapture", "Lead retry job processor", "lead capture retry jobs replay or fail instead of silently completing");
  assertIncludes(systemJobService, "dead_lettered_at: null", "Manual retry clears dead-letter", "operator retry can make dead-lettered jobs claimable again");
  assertIncludes(systemJobService, "dead_letter_reason", "System job dead-letter state", "failed jobs preserve dead-letter reason");
  assertIncludes(systemJobService, "last_error_code", "System job error classification", "operator views can filter repeated job error classes");
  assertIncludes(systemJobService, "maxAttempts", "System job max attempts", "jobs persist an attempt ceiling for DB claim/dead-letter enforcement");
  assertIncludes(internalLaunchMonitor, "provider_usage_events", "Provider issue visibility", "operator issues include failed/stale provider usage events");

  assertIncludes(dashboardPage, "Last updated", "Dashboard last-updated state", "dashboard shows last updated timestamp");
  assertIncludes(dashboardPage, "leadLoopVerified", "Dashboard lead-loop state", "dashboard loads lead loop verification");

  assertIncludes("scripts/meta-launch-idempotency-test.md", "Interrupt after campaign creation", "Meta idempotency test doc", "forced interruption test documentation exists");
  assertIncludes("scripts/smoke-test-checklist.md", "Confirm `/preview` and `/launch` show the same selected ad.", "Manual smoke checklist", "manual staging smoke checklist exists");
  assertIncludes(productionRunbook, "Signup Abuse Controls", "Signup abuse runbook", "owner-only Supabase Auth hardening steps are documented");
  assertIncludes(productionRunbook, "Vercel Firewall / WAF Baseline", "Vercel WAF runbook", "edge bot/rate-limit rollout is documented");
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
  } else if (invalidLead.response.status === 429) {
    pass("Lead capture rejects invalid payload", "invalid public lead payload was blocked by rate limiting");
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
    } else if (second.response.status === 429) {
      pass("Lead duplicate handling", "second lead submission was safely blocked by public lead rate limiting");
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
