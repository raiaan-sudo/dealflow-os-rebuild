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

function assertOrderedIncludes(relativePath, patterns, name, detail) {
  const text = fileText(relativePath);
  let cursor = -1;

  for (const pattern of patterns) {
    const index = text.indexOf(pattern, cursor + 1);
    if (index <= cursor) {
      fail(name, detail ?? `${relativePath} has onboarding steps out of order near ${pattern}`);
      return;
    }
    cursor = index;
  }

  pass(name, detail);
}

function assertOccurrenceCount(relativePath, pattern, expected, name, detail) {
  const text = fileText(relativePath);
  const count =
    typeof pattern === "string"
      ? text.split(pattern).length - 1
      : [...text.matchAll(pattern)].length;

  if (count === expected) {
    pass(name, detail ?? `${relativePath} has ${expected} occurrence(s)`);
  } else {
    fail(name, `${detail ?? "unexpected occurrence count"}: expected ${expected}, got ${count}`);
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
  const signupPage = "src/app/signup/page.tsx";
  const paywallPage = "src/app/(app)/paywall/page.tsx";
  const onboardingPage = "src/app/(app)/onboarding/page.tsx";
  const buildFunnelPage = "src/app/(app)/build/funnel/page.tsx";
  const buildCreativesPage = "src/app/(app)/build/creatives/page.tsx";
  const creativeWizard = "src/app/(app)/build/creatives/creative-wizard.tsx";
  const creativeChatIntake = "src/app/(app)/build/creatives/creative-chat-intake.tsx";
  const creativeIntakeRoute = "src/app/api/campaigns/[id]/creative-intake/route.ts";
  const prepaywallPreview = "src/components/onboarding/prepaywall-campaign-preview.tsx";
  const onboardingRoute = "src/app/api/onboarding/plan/route.ts";
  const leadRoute = "src/app/api/lead-capture/route.ts";
  const leadForm = "src/app/f/[slug]/lead-capture-form.tsx";
  const dashboardPage = "src/app/(app)/dashboard/page.tsx";
  const dashboardView = "src/components/dashboard/campaign-dashboard-view.tsx";
  const autonomyActionsFeed = "src/components/dashboard/autonomy-actions-feed.tsx";
  const autonomyModeControl = "src/components/dashboard/autonomy-mode-control.tsx";
  const autonomyRoute = "src/app/api/autonomy/route.ts";
  const autonomyRunRoute = "src/app/api/autonomy/run/route.ts";
  const dashboardPrimitives = "src/components/dashboard/dashboard-primitives.tsx";
  const controlRoomPage = "src/app/(app)/admin/control-room/page.tsx";
  const autopilotRunbook = "docs/autonomy-pro-autopilot-v1.md";
  const validationRunbook = "docs/validation-runbook.md";
  const commandIndex = "docs/codex-command-index.md";
  const production300Runbook = "docs/production-300-client-runbook.md";
  const observabilityRunbook = "docs/observability-alerting-runbook.md";
  const builderPage = "src/app/(app)/builder/page.tsx";
  const builderPanels = "src/components/campaign/builder/builder-panels.tsx";
  const appLayout = "src/app/(app)/layout.tsx";
  const appSidebar = "src/components/layout/sidebar.tsx";
  const topBar = "src/components/layout/top-bar.tsx";
  const paywallAccess = "src/lib/paywall-access.ts";
  const settingsPage = "src/app/(app)/settings/page.tsx";
  const resultsPage = "src/app/results/page.tsx";
  const unlockPage = "src/app/(app)/unlock/page.tsx";
  const appContextService = "src/lib/services/app-context.ts";
  const metaConnect = "src/app/api/integrations/meta/connect/route.ts";
  const metaCallback = "src/app/api/integrations/meta/callback/route.ts";
  const metaOauthState = "src/lib/integrations/meta/oauth-state.ts";
  const billingCheckoutRoute = "src/app/api/billing/checkout/route.ts";
  const billingPortalRoute = "src/app/api/billing/portal/route.ts";
  const billingStatusRoute = "src/app/api/billing/status/route.ts";
  const billingService = "src/lib/services/billing-service.ts";
  const billingPlans = "src/lib/billing/plans.ts";
  const planPresentation = "src/lib/billing/plan-presentation.ts";
  const stripeService = "src/lib/integrations/stripe/service.ts";
  const stripeProvider = "src/lib/integrations/stripe/provider.ts";
  const billingWebhookMigration = "supabase/migrations/20260428140000_harden_billing_subscription_webhooks.sql";
  const billingOrderingMigration = "supabase/migrations/20260430010000_public_launch_final_hardening.sql";
  const createCampaignRoute = "src/app/api/campaigns/create/route.ts";
  const videoRoute = "src/app/api/campaigns/[id]/generate-video/route.ts";
  const staticAdsRoute = "src/app/api/campaigns/[id]/generate-static-ads/route.ts";
  const systemJobStreamRoute = "src/app/api/system-jobs/[id]/stream/route.ts";
  const launchRuntimeApi = "src/components/campaign/launch/launch-runtime-api.ts";
  const launchingPage = "src/app/(app)/launching/page.tsx";
  const launchSuccessPage = "src/app/(app)/launch-success/page.tsx";
  const legacyAiProviders = "src/lib/ai/providers.ts";
  const higgsfieldClient = "src/lib/ai/higgsfield.ts";
  const creativeEngine = "src/lib/services/creative-engine.ts";
  const campaignVisualPromptBuilder = "src/lib/services/campaign-visual-prompt-builder.ts";
  const staticCreativeAssetService = "src/lib/services/static-creative-asset-service.ts";
  const staticCreativeStorageNormalization = "src/lib/services/static-creative-storage-normalization.ts";
  const staticCreativeStorageBackfillAudit = "scripts/audit-static-creative-storage-backfill.mjs";
  const creativeChatIntakeService = "src/lib/services/creative-chat-intake-service.ts";
  const mediaBuyerFramework = "src/lib/services/media-buyer-framework.ts";
  const campaignPersistence = "src/lib/services/campaign-persistence.ts";
  const campaignPlanDocument = "src/lib/services/campaign-plan-document.ts";
  const campaignPlanPersistence = "src/lib/services/campaign-plan-persistence-service.ts";
  const directHeyGenClient = "src/lib/ai/heygen.ts";
  const videoGenerationErrors = "src/lib/ai/video-generation-errors.ts";
  const avatarProvider = "src/lib/integrations/creative/avatar-provider.ts";
  const apiRouteHelpers = "src/lib/api/route.ts";
  const rateLimitHelpers = "src/lib/api/rate-limit.ts";
  const twilioWebhookRoute = "src/app/api/sms/twilio/route.ts";
  const smsService = "src/lib/services/sms-service.ts";
  const leadMessageIdempotencyMigration = "supabase/migrations/20260428162000_harden_lead_message_idempotency.sql";
  const envHelpers = "src/lib/env.ts";
  const proxy = "src/proxy.ts";
  const sessionCostGuard = "src/lib/services/session-cost-guard.ts";
  const creditService = "src/lib/services/credit-service.ts";
  const systemJobService = "src/lib/services/system-job-service.ts";
  const campaignEntitlements = "src/lib/services/campaign-entitlements.ts";
  const subscriptionSuspensionService = "src/lib/services/subscription-suspension-service.ts";
  const activationTelemetryService = "src/lib/services/activation-telemetry-service.ts";
  const activationTelemetryRoute = "src/app/api/activation/events/route.ts";
  const activationTelemetryMigration = "supabase/migrations/20260504183000_create_activation_events.sql";
  const campaignValueReportBuilder = "src/lib/services/campaign-value-report-builder.ts";
  const campaignValueReportService = "src/lib/services/campaign-value-report-service.ts";
  const campaignValueReportMigration = "supabase/migrations/20260504190000_create_campaign_value_reports.sql";
  const billingRecoveryService = "src/lib/services/billing-cancellation-intent-service.ts";
  const billingCancellationIntentRoute = "src/app/api/billing/cancellation-intent/route.ts";
  const billingCancellationIntentMigration = "supabase/migrations/20260504203000_create_billing_cancellation_intents.sql";
  const billingCancellationIntentForm = "src/components/billing/cancellation-intent-form.tsx";
  const customerSuccessService = "src/lib/services/customer-success-service.ts";
  const customerSuccessMigration = "supabase/migrations/20260504210000_create_customer_success_checklists.sql";
  const clientErrorMigration = "supabase/migrations/20260504223000_create_client_error_events.sql";
  const metaSyncOptimizationMigration = "supabase/migrations/20260509020000_create_meta_sync_and_optimization_tables.sql";
  const clientErrorRoute = "src/app/api/client-errors/route.ts";
  const clientErrorListener = "src/components/telemetry/client-error-listener.tsx";
  const clientErrorService = "src/lib/services/client-error-telemetry-service.ts";
  const commandCenterPage = "src/app/(app)/admin/command-center/page.tsx";
  const commandCenterConsole = "src/app/(app)/admin/command-center/command-center-console.tsx";
  const adminIssuesPage = "src/app/(app)/admin/issues/page.tsx";
  const supportWidget = "src/components/layout/support-widget.tsx";
  const staticCreativePreviewCard = "src/components/campaign/static-creative-preview-card.tsx";
  const staticAdComposedPreview = "src/components/campaign/static-ad-composed-preview.tsx";
  const staticAdTemplateRenderer = "src/lib/services/static-ad-template-renderer.ts";
  const staticCreativeImageQa = "src/lib/services/static-creative-image-qa.ts";
  const finishedAdVisionQa = "src/lib/services/finished-ad-vision-qa.ts";
  const assetGenerationLifecycle = "src/lib/services/asset-generation-lifecycle.ts";
  const campaignPublishPanel = "src/components/campaign/campaign-publish-panel.tsx";
  const launchMetaSelectionPanel = "src/components/campaign/launch/launch-meta-selection-panel.tsx";
  const selectAdRoute = "src/app/api/campaigns/[id]/select-ad/route.ts";
  const supportRoute = "src/app/api/support/ticket/route.ts";
  const supportCategories = "src/lib/support/support-categories.ts";
  const supportTicketService = "src/lib/support/support-ticket.ts";
  const freshdeskService = "src/lib/support/freshdesk.ts";
  const safeE2eConfig = "playwright.safe.config.ts";
  const safeE2eSpec = "tests/e2e/safe-self-serve.spec.ts";
  const publishRoute = "src/app/api/campaigns/[id]/publish/route.ts";
  const publicFunnelPage = "src/app/f/[slug]/page.tsx";
  const publicFunnelThankYouPage = "src/app/f/[slug]/thank-you/page.tsx";
  const publicFunnelThankYouTracker = "src/app/f/[slug]/thank-you/thank-you-conversion-tracker.tsx";
  const publicFunnelThankYouModel = "src/lib/public-funnel-thank-you.ts";
  const directResponseFunnelDocs = "docs/direct-response-funnel-variant-engine.md";
  const directResponseFunnelQaDocs = "docs/direct-response-funnel-qa-checklist.md";
  const directResponseFunnelCompatibilityDocs = "docs/direct-response-funnel-backward-compatibility.md";
  const campaign345RepairScript = "scripts/repair-campaign-345-launch-state.mjs";
  const campaign345RepairTest = "scripts/test-campaign-345-state-repair.mjs";
  const launchBudgetTrackingSafetyTest = "scripts/test-launch-budget-tracking-safety.mjs";
  const optimizeRoute = "src/app/api/campaigns/[id]/optimize/route.ts";
  const internalLaunchMonitor = "src/lib/services/internal-launch-monitor.ts";
  const metaExecution = "src/lib/integrations/meta/execution.ts";
  const metaLaunchService = "src/lib/services/meta-launch-service.ts";
  const metaPayloadGuardrails = "src/lib/integrations/meta/launch-payload-guardrails.ts";
  const imageProvider = "src/lib/integrations/creative/image-provider.ts";
  const loginForm = "src/components/auth/login-form.tsx";
  const middleware = "src/proxy.ts";
  const selfServeScaleAudit = "docs/self-serve-scale-audit.md";
  const creativeGenerationDocs = "docs/creative-generation-system.md";
  const ciGateSource = fileExists(".github/workflows/ci.yml")
    ? ".github/workflows/ci.yml"
    : "docs/production-100-client-runbook.md";
  const productionRunbook = "docs/production-100-client-runbook.md";
  const membershipPolicyMigration = "supabase/migrations/20260430060000_harden_membership_insert_policy.sql";

  assertIncludes(loginForm, "redirectTo.searchParams.set(\"next\", nextPath)", "Auth redirect preservation", "OAuth sign-in keeps next path");
  assertIncludes(middleware, "pathname.startsWith(\"/f/\")", "Public funnel route", "/f/[slug] remains public");
  assertIncludes(middleware, "\"/robots.txt\"", "Public robots route", "robots.txt remains crawler-visible");
  assertIncludes(middleware, "\"/sitemap.xml\"", "Public sitemap route", "sitemap.xml remains crawler-visible");
  assertIncludes(middleware, "\"/opengraph-image\"", "Public Open Graph image route", "social preview image remains public");
  assertIncludes(onboardingRoute, "onboarding_idempotency_key", "Onboarding idempotency persistence", "campaign plans store onboarding idempotency key");
  assertIncludes(onboardingPage, "dealflow-guided-onboarding-v3", "Onboarding local draft persistence", "safe builder persists draft state locally without stale v2 step order");
  assertIncludes(onboardingPage, "(!searchParams.get(\"resume\") && !searchParams.get(\"campaignId\"))", "Onboarding fresh-by-default route", "/onboarding starts a new campaign unless recovery or edit is explicit");
  assertIncludes(onboardingPage, "searchParams.get(\"resume\") === \"1\"", "Onboarding explicit draft recovery", "saved local drafts are recovered only from an explicit resume path");
  assertIncludes(onboardingPage, "lastSubmittedCampaignId", "Onboarding submitted campaign marker", "submitted campaigns are tracked without becoming the next fresh campaign default");
  assertIncludes(onboardingPage, "New campaign", "Onboarding new-campaign action", "users can explicitly start a clean campaign draft");
  assertIncludes(onboardingPage, "Step-by-step campaign builder", "Onboarding step builder UI", "safe wizard title is visible");
  assertOrderedIncludes(
    onboardingPage,
    [
      "{ key: \"intent\", label: \"Type\", title: \"Choose campaign type\" }",
      "{ key: \"market\", label: \"Market\", title: \"Pick the city or market\" }",
      "{ key: \"property\", label: \"Property\", title: \"Choose inventory focus\" }",
      "{ key: \"offer\", label: \"Offer\", title: \"Shape the audience and offer\" }",
      "{ key: \"agent\", label: \"Agent\", title: \"Identify the agent\" }",
      "{ key: \"plan\", label: \"Plan\", title: \"Select behavior\" }",
      "{ key: \"review\", label: \"Review\", title: \"Confirm and build\" }",
    ],
    "Onboarding campaign-first step order",
    "guided onboarding starts with campaign type, then market, property, offer, agent, plan, and review",
  );
  assertIncludes(onboardingPage, "Buyer leads", "Onboarding buyer selection", "buyer lead type remains selectable");
  assertIncludes(onboardingPage, "Seller leads", "Onboarding seller selection", "seller lead type remains selectable");
  assertIncludes(onboardingPage, "Investor leads", "Onboarding investor selection", "investor campaign mode remains selectable");
  assertIncludes(onboardingPage, "Commercial leads", "Onboarding commercial selection", "commercial campaign mode remains selectable");
  assertIncludes(onboardingPage, "PROPERTY_TYPE_OPTIONS", "Onboarding dynamic property type options", "property options are keyed by campaign mode");
  assertIncludes(onboardingPage, "First-time buyer homes", "Buyer property type coverage", "buyer mode has residential-specific property choices");
  assertIncludes(onboardingPage, "Probate/estate sale", "Seller property type coverage", "seller mode has seller/listing-specific property choices");
  assertIncludes(onboardingPage, "Cash-flow rentals", "Investor property type coverage", "investor mode has cash-flow property choices");
  assertIncludes(onboardingPage, "Value-add properties", "Investor value-add property coverage", "investor mode includes value-add property choices");
  assertIncludes(onboardingPage, "Duplex/triplex/fourplex", "Investor small multifamily coverage", "investor mode includes duplex/triplex/fourplex choices");
  assertIncludes(onboardingPage, "BRRRR opportunities", "Investor BRRRR coverage", "investor mode includes BRRRR choices");
  assertIncludes(onboardingPage, "Off-market deals", "Investor off-market coverage", "investor mode includes off-market choices");
  assertIncludes(onboardingPage, "Industrial", "Commercial industrial coverage", "commercial mode includes industrial choices");
  assertIncludes(onboardingPage, "Warehouse", "Commercial warehouse coverage", "commercial mode includes warehouse choices");
  assertIncludes(onboardingPage, "Owner-user", "Commercial owner-user coverage", "commercial mode includes owner-user choices");
  assertIncludes(onboardingPage, "Lease opportunities", "Commercial lease coverage", "commercial mode includes lease choices");
  assertIncludes(onboardingPage, "Purchase opportunities", "Commercial purchase coverage", "commercial mode includes purchase choices");
  assertIncludes(onboardingPage, "agentFirstName", "Onboarding agent first name", "agent first name is collected before campaign creation");
  assertIncludes(onboardingPage, "agentLastName", "Onboarding agent last name", "agent last name is collected before campaign creation");
  assertIncludes(onboardingPage, "agentCompanyName", "Onboarding agent company", "agent company is collected before campaign creation");
  assertIncludes(onboardingPage, "agentPhone", "Onboarding agent phone", "agent phone is collected for lead alerts");
  assertIncludes(onboardingPage, "PrepaywallCampaignPreview", "Onboarding pre-paywall preview integration", "guided onboarding shows a campaign preview before checkout");
  assertIncludes(prepaywallPreview, "DealFlow Preview", "Pre-paywall creative watermark", "mock creative frames are visibly watermarked as previews");
  assertIncludes(prepaywallPreview, "Full generation unlocks after checkout and credits", "Pre-paywall generation lock copy", "final generation is clearly locked until checkout and credits");
  assertIncludes(prepaywallPreview, "Funnel assembling", "Pre-paywall funnel preview", "onboarding includes a deterministic funnel preview shell");
  assertIncludes(prepaywallPreview, "grid h-full min-w-0 overflow-hidden p-4", "Pre-paywall compact height bound", "normal onboarding preview stretches with the step panel instead of creating an embedded scroll area");
  assertExcludes(prepaywallPreview, "lg:max-h-[600px]", "Pre-paywall embedded scroll removed", "onboarding preview no longer uses a fixed-height internal scroll container");
  assertIncludes(prepaywallPreview, "lg:grid-cols-[minmax(230px,0.95fr)_minmax(280px,1.05fr)]", "Pre-paywall compact grid", "normal onboarding preview uses a balanced compact console grid instead of a single tall stack");
  assertIncludes(prepaywallPreview, "flex min-h-[250px] flex-col", "Pre-paywall compact ad geometry", "normal onboarding and paywall sidecar previews let the ad mock fill its available space");
  assertIncludes(prepaywallPreview, "min-h-[210px] flex-1", "Pre-paywall ad fill guard", "compact ad preview content expands instead of leaving a dead empty gradient area");
  assertIncludes(prepaywallPreview, "xl:grid-cols-[minmax(260px,0.92fr)_minmax(0,1.08fr)]", "Pre-paywall package grid", "review/paywall package preview uses a wider balanced grid");
  assertIncludes(prepaywallPreview, "line-clamp-2", "Pre-paywall text height guard", "preview copy is clamped in compact surfaces to prevent vertical stretching");
  assertIncludes(prepaywallPreview, "CompactLockedPill", "Pre-paywall compact locked states", "normal onboarding renders locked generation states as compact pills");
  assertIncludes(prepaywallPreview, "AI video generation locked", "Pre-paywall AI video lock", "AI video generation is locked before payment");
  assertIncludes(prepaywallPreview, "AI image generation locked", "Pre-paywall image generation lock", "paid image generation is locked before payment");
  assertIncludes(prepaywallPreview, "Full-resolution files locked", "Pre-paywall full-resolution lock", "full-resolution asset access is locked before payment");
  assertIncludes(prepaywallPreview, "Sample CTA:", "Pre-paywall sample CTA labeling", "preview CTA is labeled as a sample lead-form action, not an app payment action");
  assertIncludes(prepaywallPreview, "AI image locked", "Pre-paywall compact image lock", "normal onboarding uses compact locked-state pills");
  assertIncludes(prepaywallPreview, "AI video locked", "Pre-paywall compact video lock", "normal onboarding uses compact locked-state pills");
  assertIncludes(prepaywallPreview, "onContextMenu={(event) => event.preventDefault()}", "Pre-paywall context-menu guard", "preview blocks basic context-menu saving");
  assertIncludes(prepaywallPreview, "select-none", "Pre-paywall text selection guard", "preview uses non-selectable preview framing");
  assertExcludes(prepaywallPreview, "href=\"download\"", "Pre-paywall download link avoided", "preview component does not expose a download link");
  assertExcludes(prepaywallPreview, ">Download<", "Pre-paywall download button avoided", "preview component does not expose a download button");
  assertIncludes(onboardingPage, "/api/onboarding/plan", "Onboarding persisted campaign creation", "final step saves a real campaign through the onboarding API");
  assertIncludes(onboardingPage, "/paywall?campaignId=", "Onboarding checkout handoff", "final step opens checkout with the persisted campaign id");
  assertIncludes(onboardingPage, "/api/billing/status", "Onboarding billing status", "guided onboarding checks existing launch access before showing checkout");
  assertIncludes(onboardingPage, "/build/creatives?campaignId=", "Onboarding active-plan handoff", "active subscribers continue to creative selection instead of a second checkout");
  assertIncludes(onboardingPage, "Continue to creatives", "Onboarding active-plan CTA", "active subscribers see a creative handoff instead of checkout copy");
  assertIncludes(billingStatusRoute, "canCreateAdditionalCampaign", "Billing status campaign-slot gate", "onboarding receives the current campaign-slot entitlement");
  assertIncludes(billingStatusRoute, "canUseExistingLaunchAccess", "Billing status existing launch access", "Pro and override campaign slots do not open a duplicate checkout");
  assertIncludes(onboardingPage, "Recommended audience", "Onboarding audience recommendation", "offer step recommends an audience instead of requiring agents to invent one");
  assertIncludes(onboardingPage, "AUDIENCE_REASONS", "Onboarding audience reason copy", "offer step explains why DealFlow chose the audience");
  assertIncludes(onboardingPage, "OFFER_SUGGESTIONS", "Onboarding offer suggestion library", "offer step provides selectable offer ideas by campaign mode");
  assertIncludes(onboardingPage, "Curated Home List", "Buyer offer suggestion", "buyer mode includes media-buyer offer suggestions");
  assertIncludes(onboardingPage, "Home Equity Snapshot Report", "Seller offer suggestion", "seller mode includes media-buyer offer suggestions");
  assertIncludes(onboardingPage, "Cash Flow Deal List", "Investor offer suggestion", "investor mode includes media-buyer offer suggestions");
  assertIncludes(onboardingPage, "Available spaces shortlist", "Commercial offer suggestion", "commercial mode includes offer suggestions");
  assertExcludes(onboardingPage, "/api/generate-creatives", "Onboarding paid generation avoided", "safe onboarding UI does not call paid creative generation");
  assertExcludes(onboardingPage, "/api/generate-funnel", "Onboarding funnel provider avoided", "safe onboarding UI does not call funnel generation");
  assertExcludes(prepaywallPreview, "/api/generate-creatives", "Pre-paywall creative provider avoided", "preview component does not call paid creative generation");
  assertExcludes(prepaywallPreview, "/api/generate-funnel", "Pre-paywall funnel provider avoided", "preview component does not call paid funnel generation");
  assertExcludes(prepaywallPreview, "ALLOW_OPENAI_IMAGE_GENERATION", "Pre-paywall OpenAI provider avoided", "preview component does not reference paid OpenAI generation gates");
  assertExcludes(prepaywallPreview, "ALLOW_HEYGEN_VIDEO_GENERATION", "Pre-paywall HeyGen provider avoided", "preview component does not reference paid HeyGen generation gates");
  assertIncludes(buildFunnelPage, "redirect(campaignId ? `/builder", "Funnel route build-home redirect", "legacy funnel subroute sends users back to the Build workspace");
  assertIncludes(buildCreativesPage, "redirect(`/builder?campaignId=", "Creatives recovery build-home redirect", "creative prerequisites send users back to the Build workspace instead of onboarding or recovery screens");
  assertIncludes(unlockPage, "redirect(creativesHref)", "Unlock creative handoff", "activated users continue into creative selection instead of dashboard or Meta setup");
  assertIncludes(unlockPage, "Checkout cancelled", "Checkout cancel recovery state", "cancelled checkout stays on a clear recovery screen instead of silently redirecting");
  assertIncludes(paywallPage, "Back to build", "Paywall back path", "activation back controls return to the Build workspace when a campaign exists");
  assertIncludes(previewPage, "redirect(\"/builder\")", "Preview missing state redirect", "review never becomes a second setup or missing-data workflow");
  assertIncludes(previewPage, "Back to build", "Preview back path", "review back controls return to the Build workspace");
  assertIncludes(builderPage, "Choose creatives", "Builder post-activation next step", "active campaign workspace sends unselected campaigns to creative selection before review");
  assertExcludes(buildFunnelPage, "ArtifactRecoveryPanel", "Funnel technical recovery hidden", "agents do not see technical artifact recovery under Build");
  assertExcludes(buildCreativesPage, "ArtifactRecoveryPanel", "Creative technical recovery hidden", "agents do not see technical artifact recovery under Build");
  assertExcludes(buildCreativesPage, "Creative artifacts are missing", "Creative missing copy hidden", "missing creative artifacts no longer show as an app page");
  assertIncludes(buildCreativesPage, "max-w-[1500px]", "Creative build workspace width", "creative selection uses more of the desktop viewport");
  assertIncludes(creativeWizard, "Selected creative preview", "Creative wizard primary focus", "creative selection leads with one large selected creative preview instead of repeated stacks");
  assertIncludes(creativeWizard, "Creative carousel", "Creative carousel selector", "agents can view every generated creative and select the test set from an always-visible carousel");
  assertIncludes(creativeWizard, "Click any card to view it large above", "Creative carousel inspection cue", "creative carousel tells users how to inspect the full creative");
  assertIncludes(creativeWizard, "Pick at least", "Creative static floor copy", "Creative Studio treats the configured static creative count as the launch floor and optional larger-budget variants separately");
  assertIncludes(creativeWizard, "Render fresh UGC video", "Creative UGC stale-script repair", "older UGC renders can be refreshed when the approved script changes");
  assertIncludes(creativeWizard, "videoMatchesApprovedScript", "Creative UGC script hash gate", "UGC videos cannot be selected for launch when their script hash does not match the approved script");
  assertExcludes(creativeChatIntake, "promptVersion?.sanitizedPreview", "Creative approved brief summary", "approved Creative Studio summary avoids backend prompt/version fields");
  assertExcludes(builderPanels, "provider job completes", "Builder video provider jargon hidden", "builder video status copy does not expose provider-job language to customers");
  assertExcludes(builderPanels, "asset.provider_name", "Builder asset provider names hidden", "builder asset rows avoid exposing raw provider names in customer-facing copy");
  assertIncludes(creativeWizard, "snap-x", "Creative carousel readable cards", "creative carousel uses full preview cards instead of compressed summary-only tiles");
  assertIncludes(creativeWizard, "Save the 3 static ads now; UGC can be added later if needed.", "Creative static package save gate", "selected creative sets can continue with the three launch-ready static ads without requiring UGC");
  assertExcludes(creativeWizard, "Keep at least one native-style concept", "Creative native-style quota removed", "native-style/UGC quota cannot block saving the static launch package");
  assertIncludes(creativeWizard, "Retry render", "Creative retry secondary action", "retry/regenerate remains a secondary failed-state action");
  assertIncludes(creativeWizard, "Video preview", "Creative video preview panel", "creative selection exposes the video concept and render status");
  assertIncludes(creativeWizard, "/generate-video", "Creative video render", "creative selection can queue the campaign video render from the video panel");
  assertIncludes(creativeWizard, "View full video", "Creative video fullscreen", "video previews can be watched in a full-screen review modal");
  assertIncludes(creativeWizard, "activeVideoId", "Creative video carousel state", "video concepts have a selectable carousel instead of a single hidden primary");
  assertIncludes(creativeWizard, "aria-label={`View ${video.title}`}", "Creative video carousel labels", "video carousel cards expose labeled controls for smoke and accessibility coverage");
  assertIncludes(creativeWizard, "aria-label=\"Close full video\"", "Creative video fullscreen close label", "full-screen video review has an explicit close control");
  assertIncludes(creativeWizard, "customerVideoMessage", "Creative video error sanitizer", "video failures do not expose provider guard internals to customers");
  assertIncludes(avatarProvider, "AI video rendering is not enabled for this workspace yet.", "Video disabled customer copy", "provider kill-switch failures use customer-safe copy");
  assertIncludes(creativeWizard, "imageRenderPending", "Creative retry optimistic state", "retry clicks immediately clear stale failed-copy and show a generating state while provider work runs");
  assertIncludes(creativeWizard, "activeImageJobId", "Creative image active-job state", "image preview progress stays visible while an active render job is streaming");
  assertIncludes(creativeWizard, "activeVideoJobId", "Creative video active-job state", "video preview progress stays visible while an active render job is streaming");
  assertIncludes(creativeWizard, "Sent for generation. Usually takes 90 seconds to 3 minutes", "Creative render click feedback", "render clicks give visible feedback while draft previews remain usable");
  assertIncludes(creativeWizard, "Preview renders locked until ready", "Creative preview locked state", "in-progress static renders lock preview loading until the job is ready");
  assertIncludes(creativeWizard, "Show preview renders", "Creative preview unlock action", "finished renders load only after the explicit preview action");
  assertIncludes(creativeWizard, "Retry UGC video", "Creative UGC retry action", "completed but review-only UGC renders expose a retry action instead of looking stuck");
  assertIncludes(creativeWizard, "getVideoLaunchReadinessReason", "Creative UGC truthful rejection reason", "completed but non-launch-ready UGC videos show the exact launch-readiness reason");
  assertIncludes(creativeWizard, "Image preview is being prepared. This page will update when the visual is ready.", "Creative retry pending copy", "creative cards show immediate pending feedback instead of stale cap errors");
  assertIncludes(creativeWizard, "getStaticPreviewStatusMessage", "Creative partial-count copy", "completed image jobs report ready/missing/failed counts instead of generic ready copy");
  assertIncludes(creativeWizard, "Preparing first 3 launch-ready ads", "Creative first-three progress copy", "creative rendering prioritizes the required first three launch-ready ads before optional polish variants");
  assertIncludes(creativeWizard, "You can keep setting up Meta, billing, and preview while final ads finish", "Creative slow-render fallback copy", "creative rendering has a 3-minute background-mode message instead of looking stuck");
  assertIncludes("src/lib/services/creative-media-readiness.ts", "launch-ready previews available", "Creative partial-count wording", "partial image generation copy exposes counts without treating optional failed variants as launch blockers");
  assertIncludes(creativeWizard, "customerImageMessage", "Creative image error sanitizer", "image preview failures do not expose provider or infrastructure wording to customers");
  assertIncludes(signupPage, "mode: \"sign-up\"", "Signup canonical redirect", "/signup redirects to the canonical /login sign-up mode instead of 404");
  assertIncludes(proxy, "\"/signup\"", "Signup public route", "/signup is public before auth middleware so public users reach the canonical redirect");
  assertIncludes(previewPage, "ReviewOnlyCreativePreview", "Preview review-only fallback", "fresh campaigns can render Preview without selected launch-ready media");
  assertIncludes(previewPage, "cannot satisfy Meta launch gates", "Preview fallback launch warning", "review-only preview media cannot be mistaken for launch-ready media");
  assertExcludes(previewPage, /selectedAds\.length\s*===\s*0[\s\S]{0,120}redirect\(/, "Preview no creative redirect removed", "preview no longer redirects solely because no selected creative set exists");
  assertIncludes(creativeWizard, "missingOnly: true", "Creative retry refill payload", "creative retry payloads refill unfinished previews without full creative regeneration");
  assertIncludes(creativeWizard, "Draft selection only. Launch remains blocked until this set is saved.", "Creative draft selection copy", "creative page distinguishes recommended draft selections from saved launch selections");
  assertIncludes(creativeWizard, "Approved brief source: saved creative intake", "Creative durable approval source", "creative review no longer has a local-only approval gate");
  assertIncludes(creativeWizard, "Primary creative", "Creative primary label", "creative selection clearly labels the primary creative");
  assertIncludes(creativeWizard, "Review variant", "Creative review variant label", "creative selection distinguishes review variants from the primary creative");
  assertExcludes(creativeWizard, "Approve static brief", "Creative local static approval removed", "creative wizard does not keep an in-memory static approval button");
  assertExcludes(creativeWizard, "Approve UGC questions", "Creative local UGC approval removed", "creative wizard does not keep an in-memory UGC approval button");
  assertExcludes(creativeWizard, "provider rendering stays off", "Creative provider copy hidden", "creative wizard avoids customer-facing provider terminology");
  assertExcludes(creativeWizard, "automatic: true", "Creative paid auto-render avoided", "creative page load does not automatically queue paid image or video provider work");
  assertIncludes(creativeWizard, "optional previews need another attempt", "Creative non-auto refresh copy", "creative page does not imply provider refresh is running before a user-triggered retry");
  assertExcludes(creativeWizard, "missingOnly: false", "Creative retry full regeneration avoided", "creative retry controls do not request full static regeneration");
  assertExcludes(creativeWizard, "Regenerate previews", "Creative retry full-regenerate copy removed", "customer-facing retry copy does not imply a full regenerate");
  assertIncludes(creativeWizard, "Daily image refresh limit reached for this campaign.", "Creative image cap copy", "creative retries show a clear daily-limit state instead of pretending renders are still running");
  assertIncludes(creativeWizard, "Daily image limit reached", "Creative image cap button state", "retry buttons are disabled when the campaign image cap is exhausted");
  assertIncludes(creativeWizard, "Video preview is processing. This page will update when it is ready.", "Creative video async copy", "video job completion does not claim playable video is ready before a file URL exists");
  assertExcludes(creativeWizard, "Video preview is ready.", "Creative video premature ready copy removed", "video generation does not claim a playable render before the finished URL is available");
  assertIncludes(creativeWizard, "Back to build", "Creative wizard build return", "creative selection returns to the Build workspace instead of another setup flow");
  assertExcludes(creativeWizard, /OpenAI|HeyGen/i, "Creative wizard provider jargon hidden", "creative selection does not expose OpenAI or HeyGen copy to customers");
  assertIncludes("src/lib/services/funnel-engine.ts", "cleanMarketingCopy", "Funnel copy sanitizer", "funnel copy removes awkward repeated market and spacing artifacts");
  assertIncludes("src/lib/services/funnel-engine.ts", "trimWords(cleanMarketingCopy(headline), 14)", "Funnel headline length guard", "funnel headlines are capped instead of over-concatenating onboarding fields");
  assertIncludes("src/lib/services/funnel-engine.ts", "conciseOfferPhrase", "Funnel offer shaping", "offer and lead magnet shape funnel copy without being dumped raw into the headline");
  assertOrderedIncludes(directResponseFunnelDocs, [
    "1. Hero / offer",
    "2. Trust bar",
    "3. Proof metrics",
    "4. Market snapshot",
    "5. How it works",
    "6. Benefits",
    "7. Objections / risk reversal",
    "8. FAQ",
    "9. Capture form",
    "10. Closing CTA",
  ], "Funnel V1 ten-variant docs", "direct-response funnel docs keep the ten required conversion modules in order");
  assertIncludes("src/lib/services/funnel-engine.ts", "createSection(\"hero\"", "Funnel V1 hero module", "engine keeps the required direct-response hero module");
  assertIncludes("src/lib/services/funnel-engine.ts", "createSection(\"trust_bar\"", "Funnel V1 trust module", "engine keeps the required direct-response trust bar module");
  assertIncludes("src/lib/services/funnel-engine.ts", "createSection(\"proof_metrics\"", "Funnel V1 proof module", "engine keeps the required direct-response proof module");
  assertIncludes("src/lib/services/funnel-engine.ts", "\"market_snapshot\"", "Funnel V1 market module", "engine keeps the required direct-response market snapshot module");
  assertIncludes("src/lib/services/funnel-engine.ts", "createSection(\"process\"", "Funnel V1 how-it-works module", "engine keeps the required direct-response process module");
  assertIncludes("src/lib/services/funnel-engine.ts", "\"benefits\"", "Funnel V1 benefits module", "engine keeps the required direct-response benefits module");
  assertIncludes("src/lib/services/funnel-engine.ts", "createSection(\"objections\"", "Funnel V1 risk-reversal module", "engine keeps the required direct-response objections module");
  assertIncludes("src/lib/services/funnel-engine.ts", "createSection(\"faq\"", "Funnel V1 FAQ module", "engine keeps the required direct-response FAQ module");
  assertIncludes("src/lib/services/funnel-engine.ts", "\"form\"", "Funnel V1 capture module", "engine keeps the required direct-response capture form module");
  assertIncludes("src/lib/services/funnel-engine.ts", "createSection(\"closing_cta\"", "Funnel V1 closing CTA module", "engine keeps the required direct-response closing CTA module");
  assertIncludes("src/lib/services/funnel-engine.ts", "Proof before commitment", "Funnel proof section title", "generated funnels include a proof-before-commitment section");
  assertIncludes("src/lib/services/funnel-engine.ts", "How the mechanism works", "Funnel how-it-works section title", "generated funnels explain the mechanism before conversion");
  assertIncludes("src/lib/services/funnel-engine.ts", "Questions prospects ask before converting", "Funnel FAQ section title", "generated funnels include an FAQ section before final conversion");
  assertIncludes("src/components/funnel/funnel-preview.tsx", "Quick capture", "Funnel preview form-above-fold support", "operator previews show the form in the first viewport");
  assertIncludes(publicFunnelPage, "lg:grid-cols-[minmax(0,1fr)_390px]", "Public funnel form-above-fold layout", "public funnels keep lead capture in the desktop hero area");
  assertIncludes(publicFunnelPage, "id=\"lead-capture\"", "Public funnel lead-capture anchor", "public funnels expose an above-fold CTA anchor to the lead form");
  assertIncludes(publicFunnelPage, "lg:sticky lg:top-6", "Public funnel sticky lead form", "public funnel lead capture stays visible during desktop proof review");
  assertIncludes(leadForm, "SMS_CONSENT_COPY", "Public funnel compliance consent", "lead capture keeps explicit SMS consent copy");
  assertIncludes(leadForm, "Consent is not a condition of purchase.", "Public funnel compliance disclaimer", "lead capture keeps the required consent disclaimer");
  assertIncludes(leadForm, "Privacy Policy", "Public funnel privacy link", "lead capture keeps privacy policy access");
  assertIncludes(leadForm, "Terms", "Public funnel terms link", "lead capture keeps terms access");
  assertIncludes(directResponseFunnelQaDocs, "Do not submit real leads.", "Funnel QA no-lead boundary", "QA checklist forbids real lead submissions");
  assertIncludes(directResponseFunnelQaDocs, "proof/how-it-works/FAQ/compliance", "Funnel QA content coverage", "QA checklist names the required content coverage");
  assertIncludes(directResponseFunnelCompatibilityDocs, "published_funnel_snapshot_stale", "Funnel stale snapshot docs", "compatibility notes document launch fail-closed behavior");
  assertIncludes(directResponseFunnelCompatibilityDocs, "/f/raiaan-realty", "Funnel legacy alias docs", "compatibility notes document the legacy paid alias");
  assertIncludes("src/components/funnel/funnel-preview.tsx", "shouldUseOfferHero", "Funnel preview offer override", "existing saved funnels render an offer-led hero when stored copy is too generic");
  assertIncludes("src/components/funnel/funnel-preview.tsx", "section.type !== \"hero\"", "Funnel preview duplicate hero guard", "review preview does not repeat a stale hero section below the offer-led hero");
  assertIncludes(creativeEngine, "preventDuplicateStaticCreativeCopy", "Creative duplicate prevention", "static creative options deterministically vary duplicate headline/body/CTA combinations");
  assertIncludes(creativeEngine, "creativeAngleLabel", "Creative angle labels", "static creative copy receives distinct mode-specific marketing angles");
  assertIncludes(creativeEngine, "static-ugc-proof", "Static UGC concept slot", "creative test sets reserve a UGC-style proof concept inside the six static image renders");
  assertIncludes(creativeEngine, "static-ugc-walkthrough", "Static UGC walkthrough slot", "creative test sets reserve a UGC-style walkthrough/native social concept inside the six static image renders");
  assertIncludes(campaignVisualPromptBuilder, "TEXT-FREE BACKGROUND ASSET ONLY", "Higgsfield background-only prompt contract", "image prompts produce clean visual backgrounds instead of baked-text finished ads");
  assertIncludes(campaignVisualPromptBuilder, "The final headline, proof chips, CTA, and layout will be rendered by DealFlow", "Generated image text guard", "image prompts make deterministic app composition the source of truth for text");
  assertIncludes(campaignVisualPromptBuilder, "UGC-style source image", "UGC image prompt guidance", "UGC-style image concepts get creator POV and native social direction without fake captions");
  assertIncludes(campaignVisualPromptBuilder, "Media-buyer reference pattern", "Media buyer reference prompt", "static creative prompts carry concrete media-buyer reference layouts");
  assertIncludes(campaignVisualPromptBuilder, "precon deposit, event, and construction-progress ad", "Precon reference pattern", "pre-con prompts can follow deposit, event, construction, and future-upside creative patterns");
  assertIncludes(campaignVisualPromptBuilder, "investor property-decision source photo", "Investor reference pattern", "investor prompts use investor source-photo reference patterns without asking providers for dashboards");
  assertIncludes(campaignVisualPromptBuilder, "seller home-value comparison ad", "Seller valuation reference pattern", "seller prompts can follow home-value comparison and before-after proof patterns");
  assertIncludes(campaignVisualPromptBuilder, "buyer listing-alert and affordability collage", "Buyer listing reference pattern", "buyer prompts can follow listing-alert, affordability, and collage creative patterns");
  assertIncludes(creativeEngine, "1-2 required UGC-style concepts inside the six-ad test set", "UGC creative quota prompt", "UGC static image concepts are explicitly framed as required test-set variants");
  assertIncludes(staticAdComposedPreview, "Launch-ready creative", "Generated creative composition", "rendered images are used as text-free backgrounds while DealFlow composes exact copy and CTA");
  assertIncludes(staticAdComposedPreview, "object-cover", "Generated background crop", "generated backgrounds fill deterministic media-buyer templates without raw baked-text layouts");
  assertIncludes(staticAdComposedPreview, "renderInstantVisualScene", "Instant creative visual scene", "creatives render a complete visual layout even when generated imagery is missing");
  assertIncludes(staticAdTemplateRenderer, "Premium visual polish needs another attempt", "Generated rejection customer copy", "missing or rejected generated backgrounds do not expose internal QA language to customers");
  assertIncludes(staticAdComposedPreview, "renderStoredFinalOnly", "Stored final preview source of truth", "app-composed final PNGs render without duplicate live text overlays");
  assertIncludes(staticAdComposedPreview, "renderStoredFinalOnly ? null : renderTemplateDetails", "Stored final text overlay guard", "stored launch-ready final ads do not receive a second browser-composed copy layer");
  assertExcludes(staticAdComposedPreview, "Image rejected, template ready", "Generated rejection jargon removed", "creative previews do not expose rejected-image internal labels");
  assertExcludes(staticAdComposedPreview, "No generated background image is available yet.", "Blank missing-background copy removed", "creative cards do not tell users the card is missing a background");
  assertExcludes(staticAdComposedPreview, "bg-gradient-to-t", "Generated creative overlay removed", "generated creative previews do not add a dark overlay across the asset");
  assertIncludes(staticAdTemplateRenderer, "background_rejected", "Legacy generated asset rejection", "old full-ad rasters and rejected outputs are withheld from the happy path");
  assertIncludes(staticCreativeImageQa, "evaluateStaticCreativeImageQa", "Static image QA service", "generated image URLs pass through a server-side image QA gate before ready state");
  assertIncludes(staticCreativeImageQa, "\"text_heavy\"", "Static image QA text rejection", "text-heavy provider rasters are rejected before launch-ready preview");
  assertIncludes(staticCreativeImageQa, "\"provider_returned_finished_ad\"", "Static image QA finished-ad rejection", "finished-ad/provider-layout artifacts are rejected before ready state");
  assertIncludes(staticCreativeImageQa, "\"finished_ad\"", "Static image QA finished-ad mode", "Marketing Studio finished rasters can be evaluated separately from background-only assets");
  assertIncludes(staticCreativeImageQa, "inspectFinishedAdWithVisionQa", "Finished-ad raster vision hook", "JPEG/PNG finished ads can be inspected by the vision QA adapter");
  assertIncludes(finishedAdVisionQa, "FINISHED_AD_VISION_QA_ENABLED", "Finished-ad vision QA env gate", "finished-ad raster vision inspection is explicit and fail-closed");
  assertIncludes(finishedAdVisionQa, "finished_ad_text_unverified", "Finished-ad vision QA fail closed", "unavailable OCR/vision keeps finished ads from becoming launch-ready");
  assertIncludes(finishedAdVisionQa, "requiredCtaPresent", "Finished-ad vision QA CTA check", "vision QA validates required CTA presence");
  assertIncludes(staticCreativeImageQa, "MAX_IMAGE_BYTES", "Static image QA fetch guard", "image QA fetches are bounded and do not log provider URLs or payloads");
  assertIncludes(staticCreativeStorageNormalization, "STATIC_CREATIVE_STORAGE_BUCKET = \"creative-assets\"", "Static generated asset storage bucket", "generated static images normalize into the app-owned creative-assets bucket");
  assertIncludes(staticCreativeStorageNormalization, "MAX_STATIC_CREATIVE_PROVIDER_IMAGE_BYTES", "Static generated asset fetch guard", "provider image fetches are bounded before app-owned storage upload");
  assertIncludes(staticCreativeAssetService, "provider_original_url", "Static provider URL audit metadata", "provider URLs are preserved only as metadata during generated static persistence");
  assertIncludes(staticCreativeAssetService, "file_url: readyUrl", "Static durable file URL persistence", "ready generated static assets use the durable app-owned URL as file_url");
  assertIncludes(staticCreativeAssetService, "allInsertedCreativesAreReady", "Static accepted asset preservation", "failed normalization does not clean up existing accepted generated assets");
  assertIncludes(campaignPersistence, "persistedStaticAdsAfterSave", "Static durable plan readback", "campaign plan persistence reloads app-owned creative assets after storage normalization");
  assertIncludes(campaignPersistence, "planStaticAds", "Static durable plan writeback", "Creative Studio and launch gates read durable app-owned static URLs after provider storage");
  assertIncludes(staticCreativeStorageBackfillAudit, "STATIC_CREATIVE_STORAGE_BACKFILL_ACK=owner-approved-production-backfill", "Static storage backfill apply gate", "legacy provider-url backfill apply mode requires explicit owner approval");
  assertIncludes(staticCreativeStorageBackfillAudit, "alreadyNormalizedRowsSkipped", "Static storage backfill idempotency", "legacy provider-url backfill skips already-normalized rows");
  assertIncludes(staticCreativeStorageBackfillAudit, "rollbackPlan", "Static storage backfill rollback plan", "legacy provider-url backfill reports rollback guidance before mutation");
  assertIncludes(creativeChatIntake, "Confirm the offer, choose the static style, approve the UGC script", "Creative chat intake UI", "guided intake collects creative direction before paid image or video rendering");
  assertIncludes(creativeChatIntake, "Final media only becomes launch-ready after it is saved to your creative library and passes launch review", "Creative intake render boundary", "creative chat intake explains that paid render work waits for approval");
  assertIncludes(creativeChatIntake, "Clean Local Expert", "Creative intake static style copy", "creative intake separates static ad direction from UGC script approval");
  assertExcludes(creativeChatIntake, "Higgsfield", "Creative intake provider name hidden", "creative intake does not expose provider names to customers");
  assertIncludes(creativeChatIntake, "Open Marketing Studio chat", "Creative intake Marketing Studio surface", "creative intake exposes DealFlow's customer-facing Marketing Studio without provider names");
  assertExcludes(creativeChatIntake, "/generate-static-ads", "Creative intake no image provider trigger", "creative chat intake does not directly queue static provider rendering");
  assertExcludes(creativeChatIntake, "/generate-video", "Creative intake no video provider trigger", "creative chat intake does not directly queue video provider rendering");
  assertIncludes(creativeIntakeRoute, "assertSameOriginRequest", "Creative intake same-origin guard", "creative intake writes reject cross-site POSTs");
  assertIncludes(creativeIntakeRoute, "getAuthenticatedContext", "Creative intake auth guard", "creative intake requires an authenticated workspace user");
  assertIncludes(staticAdsRoute, "creative_brief_review_required", "Static generation brief gate", "paid static image rendering can require a reviewed creative brief");
  assertIncludes(videoRoute, "creative_brief_review_required", "Video generation brief gate", "paid video rendering can require a reviewed creative brief");
  assertIncludes(creativeChatIntakeService, "TEXT-FREE BACKGROUND ASSET ONLY", "Creative intake prompt contract", "creative chat prompt builder preserves the background-only provider contract");
  assertIncludes(creativeChatIntakeService, "MARKETING STUDIO FINISHED AD CREATIVE", "Creative intake finished-ad prompt contract", "creative chat prompt builder can create Marketing Studio finished-ad prompts");
  assertIncludes(creativeChatIntakeService, "softenRegulatedClaims", "Creative intake claim softening", "creative chat intake softens risky approval and credit claims before prompt generation");
  assertIncludes(staticCreativePreviewCard, "View full creative", "Full creative lightbox", "creative cards expose a full-size review modal");
  assertIncludes(staticCreativePreviewCard, "aria-modal=\"true\"", "Full creative modal accessibility", "full creative review uses a dialog modal");
  assertIncludes("src/components/campaign/static-creative-preview-card.tsx", "line-clamp-3", "Creative card copy clamp", "creative cards show usable previews instead of full dense body copy");
  assertIncludes("src/components/campaign/static-creative-preview-card.tsx", "formatLabel", "UGC concept badge", "UGC-style concepts are visibly labeled in the creative selector");
  assertIncludes(staticCreativePreviewCard, "StaticCreativeSummaryCard", "Compact creative summary card", "selected creative lists use dense summary cards instead of tall repeated full previews");
  assertIncludes(mediaBuyerFramework, "mediaBuyerReference", "Creative media-buyer reference gate", "quality gates score concrete media-buyer layout/reference logic");
  assertIncludes(mediaBuyerFramework, "previewReadability", "Creative readability gate", "quality gates penalize covered, unreadable, or awkward preview states");
  assertIncludes(mediaBuyerFramework, "generic stock-photo", "Creative stock-photo penalty", "quality gates penalize generic stock-photo-looking output");
  assertIncludes(staticAdTemplateRenderer, "evaluateStaticVisualAssetDecision(input).usable", "Generated creative review guard", "generated assets are only shown as ready after the app-composed/static visual decision passes");
  assertIncludes(staticAdTemplateRenderer, "Premium visual polish needs another attempt", "Rejected image customer copy", "bad provider images show clean customer-safe retry copy instead of raw QA/provider language");
  assertIncludes(staticCreativeAssetService, "\"requires_review\"", "Rejected generated asset persistence", "generated assets with quality concerns are persisted for review instead of being mislabeled as image failures");
  assertIncludes(staticCreativeAssetService, "imageQa", "Static image QA persistence", "image QA decision metadata is stored with generated static assets");
  assertIncludes(assetGenerationLifecycle, "evaluateStaticCreativeLaunchSafety(asset).passed", "Generated asset lifecycle guard", "static asset lifecycle does not mark rejected generated creatives as fully generated");
  assertIncludes(previewPage, "StaticCreativeSummaryCard", "Preview rendered creative cards", "preview page shows rendered creative visuals instead of text-only summaries");
  assertIncludes(previewPage, "Review variants", "Preview review variant label", "preview page separates the primary creative from review variants");
  assertIncludes(previewPage, "Selected UGC video ads", "Preview video concept review", "preview page surfaces selected UGC video ads before launch");
  assertIncludes(previewPage, "playsInline", "Preview playable videos", "preview page can play finished AI UGC videos inline");
  assertIncludes(previewPage, "customerVideoMessage", "Preview video copy sanitizer", "preview page hides provider jargon from video render messages");
  assertIncludes(previewPage, "h-[520px] overflow-hidden", "Preview funnel height cap", "preview page caps the funnel preview instead of adding an embedded scroll area");
  assertIncludes(launchPage, "StaticCreativeSummaryCard", "Launch compact creative set", "launch page uses compact selected creative summaries");
  assertIncludes(launchPage, "The first saved ad is the primary creative", "Launch primary creative copy", "launch review explains primary creative versus review variants");
  assertIncludes(launchPage, "selectedCreativeMediaReady", "Launch creative media gate", "launch readiness requires selected creatives to have clean rendered images");
  assertIncludes(launchPage, "Creative media ready", "Launch creative readiness label", "launch page tells users creative media must be ready before launch");
  assertIncludes(previewPage, "applyCreativeIntakePreviewContext", "Preview approved creative context", "preview uses the approved creative-intake context to prevent CTA and seller/buyer drift");
  assertIncludes(previewPage, "Pricing and demand clarity", "Preview seller trust copy", "seller previews avoid stale buyer/private-access positioning copy");
  assertIncludes(builderPage, "Active campaign workspace", "Builder active campaign shell", "builder defaults to the active campaign workspace when a campaign exists");
  assertIncludes(builderPage, "activeCampaignCopy", "Builder active campaign count copy", "builder uses the real campaign count in active-campaign guidance");
  assertIncludes(builderPage, "mode=edit", "Builder edit gate", "full campaign editing is explicit instead of the default existing-campaign view");
  assertIncludes(builderPage, "/onboarding?new=1", "Builder secondary new campaign action", "launching another campaign opens the guided onboarding form");
  assertIncludes(builderPage, "redirect(\"/onboarding?new=1\")", "Builder new-campaign route redirect", "/builder?new=1 cannot render the advanced builder workspace");
  assertIncludes(onboardingPage, "window.localStorage.removeItem(STORAGE_KEY)", "Onboarding fresh campaign reset", "fresh campaign onboarding clears stale saved setup state");
  assertIncludes(billingPlans, "includedActiveCampaigns: 1", "Starter campaign limit", "Starter defaults to one active guided campaign");
  assertIncludes(billingPlans, "includedActiveCampaigns: null", "Pro unlimited campaign limit", "Pro exposes unlimited active campaign slots");
  assertIncludes(planPresentation, "Unlimited active campaigns", "Pro unlimited plan copy", "Pro plan copy tells users additional campaigns are included");
  assertIncludes(dashboardPage, "loadDashboardStateForCampaign", "Dashboard real route", "dashboard loads real campaign state instead of the old plan comparison demo");
  assertIncludes(dashboardPage, "CampaignDashboardView", "Dashboard guided results shell", "dashboard renders the compact guided results view");
  assertExcludes(dashboardPage, "PlanAwareResultsPreview", "Dashboard demo route removed", "dashboard no longer serves the old layout behavior comparison variant");
  assertIncludes(dashboardPrimitives, "MetricTile", "Dashboard metric tile component", "dashboard visual primitives include reusable metric tiles");
  assertIncludes(dashboardPrimitives, "DashboardChartPanel", "Dashboard chart panel component", "dashboard visual primitives include chart panels");
  assertIncludes(dashboardPrimitives, "TrendAreaChart", "Dashboard trend chart component", "dashboard visual primitives include a lightweight SVG trend chart");
  assertIncludes(dashboardPrimitives, "MiniBarChart", "Dashboard bar chart component", "dashboard visual primitives include a lightweight bar chart");
  assertIncludes(dashboardView, "DashboardVisualMarker", "Dashboard visual component marker", "dashboard renders visual component markers for smoke coverage");
  assertOccurrenceCount(dashboardView, "Waiting for first delivery data", 1, "Dashboard waiting copy appears once", "dashboard shows the no-data state once instead of repeating it");
  assertIncludes(dashboardView, "Paused launch recorded", "Dashboard paused launch state", "dashboard surfaces recorded paused Meta objects instead of saying the campaign is not launched");
  assertIncludes(dashboardView, "Launch record missing", "Dashboard missing launch record state", "dashboard reports missing local launch state without implying Meta delivery is active");
  assertExcludes(dashboardView, "Not launched", "Dashboard not-launched copy removed", "dashboard avoids stale not-launched wording when production launch records may drift");
  assertIncludes(dashboardView, "Paused Meta objects are recorded locally", "Dashboard paused launch sync copy", "dashboard copy separates local paused launch records from live delivery sync");
  assertIncludes(dashboardView, "Paused campaign object recorded", "Dashboard paused campaign object state", "dashboard operational state reflects paused Meta runtime IDs without implying active delivery");
  assertIncludes(dashboardView, "Day 0", "Dashboard day-zero baseline", "empty dashboard charts use a Day 0 launch baseline");
  assertIncludes(dashboardView, "Live data", "Dashboard live data label", "dashboard distinguishes live synced values when data exists");
  assertIncludes(dashboardView, "Raw details and activity", "Dashboard raw details disclosure", "raw details remain collapsed under a disclosure");
  assertIncludes(dashboardView, "sanitizeCustomerActionText", "Dashboard customer action sanitizer", "dashboard normalizes internal optimizer action language before display");
  assertExcludes(dashboardView, "optimizerResult.status}", "Dashboard optimizer status hidden", "raw optimizer status is not rendered directly as next-action copy");
  assertExcludes(autonomyActionsFeed, "provider adapter", "Dashboard provider adapter copy hidden", "dashboard action feed avoids provider-adapter jargon");
  assertExcludes(autonomyActionsFeed, "missing provider state", "Dashboard missing-provider copy hidden", "dashboard action feed explains blocked actions without provider-state jargon");
  assertExcludes(autonomyActionsFeed, "Mutation {", "Dashboard mutation copy hidden", "dashboard action feed labels platform updates without mutation jargon");
  assertExcludes(dashboardView, "Estimated recommendation", "Dashboard fake live label removed", "dashboard no longer labels empty recommendations as estimated live analytics");
  assertIncludes(dashboardView, "autonomySnapshot", "Dashboard Pro Autopilot snapshot", "dashboard receives and renders Pro Autopilot state");
  assertIncludes(dashboardView, "Pro Autopilot", "Dashboard Pro Autopilot surface", "customer dashboard surfaces recommendations and action history");
  assertIncludes(autonomyModeControl, "Manual keeps all actions human-driven", "Autopilot safe mode copy", "manual mode remains the default safe posture");
  assertIncludes(autonomyModeControl, "Assisted stages high-confidence actions for approval", "Autopilot assisted mode copy", "assisted mode requires operator approval before execution");
  assertIncludes(controlRoomPage, "Autonomy queue", "Control-room Pro Autopilot surface", "300-client control room must show Autopilot queue, applied, blocked, or health state");
  assertExcludes(autonomyRoute, 'executionMode: "recommendation_only"', "Autopilot route executable guard", "/api/autonomy is not hard-coded recommendation-only for Pro Autopilot readiness");
  assertExcludes(autonomyRunRoute, 'executionMode: "recommendation_only"', "Autopilot run route executable guard", "/api/autonomy/run is not hard-coded recommendation-only for Pro Autopilot readiness");
  assertIncludes(autopilotRunbook, "Default Safe Posture", "Autopilot runbook safe posture", "runbook documents fail-closed default posture");
  assertIncludes(autopilotRunbook, "Allowed Safe Actions", "Autopilot runbook safe actions", "runbook documents safe in-app actions");
  assertIncludes(autopilotRunbook, "Approval-Required Actions", "Autopilot runbook approval actions", "runbook documents side-effect approval gates");
  assertIncludes(autopilotRunbook, "Never-Allowed Actions", "Autopilot runbook never-allowed actions", "runbook documents forbidden side effects");
  assertIncludes(autopilotRunbook, "Scheduler Commands", "Autopilot runbook scheduler commands", "runbook documents cron and local scheduler commands");
  assertIncludes(autopilotRunbook, "Production-Safe Proof Boundaries", "Autopilot runbook safe proof", "runbook limits production proof to safe probes");
  assertIncludes(autopilotRunbook, "Rollback Plan", "Autopilot runbook rollback", "runbook documents rollback steps");
  assertIncludes(autopilotRunbook, "ALLOW_META_LIVE_LAUNCH", "Autopilot Meta env docs", "runbook lists Meta launch kill-switch env name only");
  assertIncludes(autopilotRunbook, "MARKETING_STUDIO_WORKER_ENABLED", "Autopilot provider env docs", "runbook lists provider worker env name only");
  assertIncludes(autopilotRunbook, "INTERNAL_SYSTEM_JOBS_SECRET", "Autopilot scheduler env docs", "runbook lists internal scheduler env name only");
  assertIncludes(autopilotRunbook, "campaign_action_suggestions", "Autopilot table docs", "runbook documents recommendation table proof");
  assertIncludes(autopilotRunbook, "campaign_draft_actions", "Autopilot draft-action docs", "runbook documents draft action table proof");
  assertIncludes(validationRunbook, "Pro Autopilot V1 Validation", "Validation runbook Autopilot section", "validation runbook includes Autopilot-specific readiness gates");
  assertIncludes(commandIndex, "Pro Autopilot V1", "Command index Autopilot section", "command index includes Autopilot commands");
  assertIncludes(production300Runbook, "Pro Autopilot V1", "300-client runbook Autopilot section", "300-client runbook references Autopilot monitoring boundaries");
  assertIncludes(observabilityRunbook, "campaign_action_suggestions", "Observability Autopilot durable table", "observability runbook includes Autopilot durable sources");
  assertIncludes(resultsPage, "/dashboard", "Results canonical redirect", "legacy /results routes redirect into the real dashboard path");
  assertExcludes(resultsPage, "plan=starter", "Results plan demo redirect removed", "legacy results route no longer opens the plan comparison demo");
  assertIncludes(appLayout, "getStageForPath", "App shell route stage", "sidebar stage label follows the current route instead of hard-coding Build");
  assertIncludes(appLayout, "ACTIVE_CAMPAIGN_COOKIE", "App shell active campaign source", "workspace shell reads the active campaign cookie for scoped navigation");
  assertIncludes(appSidebar, "buildCampaignScopedHref", "Sidebar campaign-scoped navigation", "desktop product navigation preserves the active campaign id");
  assertIncludes(appSidebar, "AI workspace", "Sidebar truthful workspace badge", "authenticated shell does not label paused Meta delivery as AI live");
  assertExcludes(appSidebar, "AI live", "Sidebar live-delivery badge removed", "authenticated shell avoids live-delivery wording while Meta objects are paused");
  assertIncludes(topBar, "buildCampaignScopedHref", "Mobile campaign-scoped navigation", "mobile product navigation and settings preserve the active campaign id");
  assertIncludes(paywallAccess, "const resolvedRecord = storedRecord ?? latestRecord", "Active campaign preference", "campaign resolution keeps the stored active campaign before falling back to latest");
  assertExcludes(paywallAccess, /campaignId: requestedCampaignId,\s*record: null/s, "Invalid campaign URL ignored", "unowned or stale query campaign ids cannot become active campaign context");
  assertExcludes(appSidebar, "useSearchParams", "Sidebar ignores raw campaign query", "sidebar navigation uses the server-resolved active campaign id");
  assertExcludes(topBar, "useSearchParams", "Top bar ignores raw campaign query", "mobile navigation uses the server-resolved active campaign id");
  assertIncludes(appLayout, "pb-20", "Workspace support safe space", "workspace content reserves bottom room for the support widget");
  assertIncludes(appLayout, "SupportWidget", "Authenticated support widget", "authenticated app shell mounts the client-facing support button");
  assertExcludes(supportWidget, "useSearchParams", "Support ignores raw campaign query", "support ticket context uses the server-resolved active campaign id");
  assertExcludes(supportWidget, "hidden sm:block", "Support mobile visibility", "support remains available on mobile critical flows");
  assertIncludes(supportWidget, "aria-modal=\"true\"", "Support dialog accessibility", "support modal is marked as a dialog");
  assertIncludes(supportWidget, "max-h-[calc(100dvh-2rem)]", "Support modal mobile fit", "support modal can scroll within short viewports");
  assertIncludes(supportWidget, "/api/support/ticket", "Support ticket route usage", "support widget sends requests to the Freshdesk-backed support route");
  assertExcludes(supportWidget, "FRESHDESK_API_KEY", "Support widget secret boundary", "Freshdesk API key is never referenced by client code");
  assertIncludes(supportRoute, "getAuthenticatedContext()", "Support ticket auth guard", "support route requires authenticated app context");
  assertIncludes(supportRoute, "assertSameOriginRequest(request)", "Support ticket CSRF guard", "support route requires same-origin requests");
  assertIncludes(supportRoute, "consumeRateLimit", "Support ticket rate limit", "support route rate-limits ticket creation");
  assertIncludes(supportRoute, "getCampaignById(campaignId)", "Support ticket campaign ownership", "support route validates optional campaign context through the ownership-aware helper");
  assertIncludes(supportRoute, "Support is temporarily unavailable. Please try again shortly.", "Support ticket generic fallback", "Freshdesk failures do not leak provider details to customers");
  assertIncludes(freshdeskService, "server-only", "Freshdesk server-only service", "Freshdesk API calls are isolated to server-only code");
  assertIncludes(freshdeskService, "/api/v2/tickets", "Freshdesk ticket endpoint", "Freshdesk service posts to the ticket API");
  assertIncludes(freshdeskService, "Buffer.from(`${config.apiKey}:X`).toString(\"base64\")", "Freshdesk Basic auth contract", "Freshdesk API key is used as username with X password server-side");
  assertIncludes(supportTicketService, "redactSupportText", "Support ticket redaction helper", "ticket context is sanitized before Freshdesk submission");
  assertIncludes(launchMetaSelectionPanel, "encodeURIComponent(launchReturnTo)", "Meta reconnect campaign return", "Meta reconnect preserves campaign-scoped launch return path");
  assertIncludes(settingsPage, "Generation credits", "Settings credit management", "settings surfaces credit balance and top-up controls");
  assertIncludes(settingsPage, "Update payment method", "Settings payment management", "settings links Stripe Portal payment method management");
  assertIncludes(settingsPage, "getBillingSummaryForCampaign", "Campaign-scoped billing settings", "settings reflects campaign-scoped billing overrides instead of only workspace billing state");
  assertIncludes(settingsPage, "Owner/test billing accepted", "QA billing acceptance settings copy", "settings distinguishes owner/test billing acceptance from a real Stripe subscription");
  assertIncludes(settingsPage, "Enabled (owner/test override)", "QA billing launch access settings label", "settings launch access label is explicit when owner/test billing acceptance is active");
  assertIncludes(onboardingRoute, "commercial", "Onboarding commercial backend defaults", "commercial real estate onboarding mode is handled server-side");
  assertIncludes(onboardingRoute, "investor", "Onboarding investor backend defaults", "investor real estate onboarding mode is handled server-side");
  assertIncludes(onboardingRoute, 'if (intent === "seller")', "Onboarding buyer listing offer guard", "buyer offers that mention listings stay on the buyer path instead of being reclassified as seller campaigns");
  assertIncludes(appContextService, "isDemoWorkspaceSeedingEnabled", "Production demo seeding guard", "workspace demo data seeding is environment-gated");
  assertIncludes(appContextService, "fallbackOrganizationSlug", "Workspace slug collision guard", "bootstrap creates a user-owned fallback slug instead of recovering another owner workspace");
  assertIncludes(appContextService, "non-owned organization", "Workspace ownership bootstrap guard", "membership bootstrap refuses non-owned organizations");
  assertIncludes("src/lib/services/canonical-campaign.ts", "nestedPlanRuntime", "Canonical nested runtime preservation", "dashboard and result surfaces preserve launch runtime IDs from nested saved plan documents");
  assertIncludes("src/lib/services/canonical-campaign.ts", "pickBestLaunchRuntime", "Canonical launch runtime prioritization", "dashboard and result surfaces prefer runtime objects with recorded Meta launch IDs over stale built defaults");
  assertIncludes("src/lib/services/canonical-campaign.ts", "staticAds: value.staticAds ?? creatives?.staticAds", "Canonical static creative priority", "authenticated creative surfaces prefer the canonical root staticAds package over stale nested creative arrays");
  assertIncludes("src/lib/services/canonical-campaign.ts", "hasHiggsfieldFinishedStaticAds(documentStaticAds)", "Canonical finished static override", "verified Higgsfield finished ads in the campaign plan override stale creative asset rows");
  assertIncludes("src/lib/services/campaign-persistence.ts", "runtimeWithRecordedLaunch", "Campaign persistence launch runtime prioritization", "authenticated campaign loads prefer runtime objects with recorded Meta launch IDs over stale built defaults");
  assertIncludes("src/lib/services/campaign-persistence.ts", "runtime: getRuntimeFromPlanRow(row)", "Campaign persistence runtime preservation", "authenticated campaign loads pass root-level launch runtime into canonical campaign normalization");
  assertIncludes(membershipPolicyMigration, "drop policy if exists organization_memberships_insert_self", "Membership self-join policy removed", "authenticated users cannot self-join arbitrary organizations");

  assertIncludes(previewPage, "loadPersistedLaunchMediaSelection", "Preview selected creative source", "preview loads persisted selected creative and UGC video sets from DB helper");
  assertIncludes(previewPage, "getSelectedAdIdsFromPlan", "Preview selected creative plan helper", "preview resolves selected creative set through typed plan helper");
  assertIncludes(launchPage, "loadPersistedLaunchMediaSelection", "Launch selected creative source", "launch loads persisted selected creative and UGC video sets from DB helper");
  assertIncludes(launchPage, "getSelectedAdIdsFromPlan", "Launch selected creative plan helper", "launch resolves selected creative set through typed plan helper");
  assertIncludes(campaignPlanDocument, "selectedAdIds", "Selected creative camel-case normalization", "launch media selection survives saved-document and browser handoff shapes");
  assertIncludes(campaignPlanDocument, "nestedPlan", "Selected creative nested normalization", "launch media selection survives nested campaign plan documents");
  assertExcludes(launchPage, "recommended", "Launch recommended fallback removed", "launch preview does not use recommended fallback");
  assertIncludes(launchPage, "budgetCapMissingForLaunch", "Launch budget cap fail-closed visibility", "launch readiness blocks production Meta object creation when the cap is missing");
  assertIncludes(launchPage, "effectiveDailyBudgetCents", "Launch effective budget visibility", "launch readiness shows the effective capped budget instead of only the campaign budget");
  assertIncludes(launchPage, "Tracking / live activation", "Launch tracking activation visibility", "launch separates paused object creation from live activation tracking readiness");
  assertIncludes(launchPage, "label: \"Meta preflight\"", "Launch Meta preflight visibility", "saved Meta selections and provider preflight are separate readiness gates");
  assertIncludes(launchPage, "Save the Meta ad account, Page, and pixel before launch.", "Launch selection blocker copy", "launch does not tell users to reconnect Meta after selections are already saved");
  assertIncludes("src/lib/env.ts", "DEALFLOW_PLATFORM_LAUNCH_DOMAIN", "Platform launch domain env", "DealFlow-hosted funnels can use the platform verified domain instead of per-customer domains");
  assertIncludes("src/lib/integrations/meta/service.ts", "getDealFlowPlatformTrackingFallback", "Meta platform domain fallback", "Meta preflight can use the verified DealFlow platform domain for DealFlow-hosted funnel traffic");
  assertIncludes("src/lib/integrations/meta/service.ts", "persistDerivedLaunchDomainFromDestination", "Meta derived launch domain persistence", "Meta preflight stores the final destination hostname as the workspace launch domain when missing");
  assertIncludes("src/lib/integrations/meta/service.ts", "liveActivationBlocked", "Meta live activation tracking guard", "partial tracking blocks live activation while paused creation can stay available");
  assertIncludes("src/lib/integrations/meta/service.ts", "ready = accountValid && pageValid && pixelValid && domainValid", "Meta preflight hard gate", "launch preflight still requires valid Meta assets and verified destination domain");
  assertExcludes("src/lib/integrations/meta/service.ts", "Configure a launch domain before Meta launch.", "Meta launch domain not hard-blocking", "missing tracking domain no longer blocks the core launch preflight");
  assertIncludes(launchPage, "Reconnect Meta", "Launch Meta error reconnect CTA", "Meta OAuth failure banners provide a direct reconnect action");
  assertIncludes(launchPage, "metaTrackingPreflightBlocked", "Launch Meta tracking blocker copy", "launch distinguishes invalid Meta selections from domain or destination preflight blockers");
  assertIncludes(launchPage, "Paused only", "Launch paused-only tracking warning", "partial tracking keeps paused object creation visible while blocking live activation");
  assertIncludes(launchPage, "Configure the verified platform launch domain", "Launch Meta domain blocker action", "launch tells operators to fix DealFlow's platform domain instead of asking agents for their own domain by default");
  assertIncludes(launchPage, "Clear message", "Launch Meta error clear CTA", "stale Meta OAuth failure URLs can be cleared without leaving launch");
  assertIncludes(launchPage, "metaReconnectHref", "Launch Meta reconnect target", "Meta reconnect preserves the campaign-scoped launch return path from the error banner");
  assertIncludes(launchPage, "Why launch is blocked", "Launch blocker explanation", "launch page explains exactly why the launch button is disabled");
  assertIncludes(launchPage, "CampaignPublishPanel", "Launch funnel publish action", "launch page exposes the public funnel publish action when publishing is blocking launch");
  assertIncludes(campaignPublishPanel, "router.refresh()", "Publish panel launch gate refresh", "successful publish actions refresh server-rendered launch gates");
  assertIncludes(campaignPublishPanel, "Boolean(persistedSlug)", "Publish panel live slug truth", "the publish panel only marks a funnel public when a persisted slug and published snapshot exist");
  assertIncludes(campaignPublishPanel, "publishedWithoutPublicSlug", "Publish panel missing slug guard", "published campaigns without public_slug show a repair state instead of a fake live URL");
  assertIncludes(campaignPublishPanel, "visibleError", "Publish panel stale error guard", "stale publish errors do not remain visible after a successful live publish");
  assertIncludes(campaignPublishPanel, "timeZone: \"UTC\"", "Publish panel hydration-stable timestamps", "client publish timestamps render the same text during SSR and browser hydration");
  assertIncludes(campaignPublishPanel, "rel=\"noreferrer\"", "Publish panel external link isolation", "published funnel links opened in a new tab do not retain opener access");
  assertIncludes(campaignEntitlements, "getCurrentBillingOverrideForOrganization", "Campaign publish billing override", "campaign-scoped entitlements honor the current billing override for owner launch walkthroughs");
  assertIncludes(campaignEntitlements, "launchOverride", "Campaign entitlement override propagation", "publish and launch entitlement checks receive billing override state");
  assertIncludes(launchMetaSelectionPanel, "Meta selections saved. Launch gates are being checked now.", "Meta selection save confirmation", "saving Meta assets gives immediate confirmation");
  assertIncludes(launchMetaSelectionPanel, "setIsSaving(true)", "Meta selection explicit saving state", "Meta asset save button tracks the full async save lifecycle");
  assertIncludes(launchingPage, "launchIntent", "Launch start intent gate", "direct launch-room visits must return to launch gates before showing the start control");
  assertIncludes(launchingPage, "await syncCampaignStatus(currentCampaignId)", "Post-launch Meta confirmation", "successful launches request a fresh Meta sync before landing on the success page");
  assertIncludes(launchingPage, "Premium launch sequence", "Launching premium sequence", "launching page has an elevated customer-facing launch sequence");
  assertIncludes(launchingPage, "Preparing campaign", "Launching step preparation", "launching page shows the preparation step");
  assertIncludes(launchingPage, "Creating Meta campaign", "Launching step campaign", "launching page shows the Meta campaign creation step");
  assertIncludes(launchingPage, "Building ad set", "Launching step ad set", "launching page shows the ad set creation step");
  assertIncludes(launchingPage, "Publishing creative", "Launching step creative", "launching page shows the creative publishing step");
  assertIncludes(launchingPage, "Sending paused launch to Meta", "Launching paused safety step", "launching page makes paused Meta launch safety visible");
  assertIncludes(launchingPage, "Confirming launch record", "Launching confirmation step", "launching page shows the final confirmation step");
  assertExcludes(launchingPage, /runtime state|provider payload|local record/i, "Launching internal copy hidden", "launching page does not expose internal runtime/provider copy");
  assertIncludes(launchSuccessPage, "Your campaign is now in Meta", "Launch success customer confirmation", "launch success leads with customer-facing confirmation copy");
  assertIncludes(launchSuccessPage, "Launch receipt", "Launch success receipt", "launch success renders a premium launch receipt");
  assertIncludes(launchSuccessPage, "Confirmed in Meta", "Launch success confirmed status", "launch success can show confirmed Meta state");
  assertIncludes(launchSuccessPage, "Waiting for Meta confirmation", "Launch success pending status", "launch success can show pending Meta confirmation");
  assertIncludes(launchSuccessPage, "Needs recheck", "Launch success recheck status", "launch success can show recheck status");
  assertIncludes(launchSuccessPage, "View in Meta", "Launch success Meta action", "launch success exposes Ads Manager handoff when a Meta campaign id exists");
  assertIncludes(launchSuccessPage, "Go to launch settings", "Launch success settings action", "launch success keeps a secondary launch settings path");
  assertExcludes(launchSuccessPage, "Estimated local state", "Launch success internal estimate copy hidden", "launch success does not show estimated local state by default");
  assertIncludes(metaSyncOptimizationMigration, "create table if not exists public.campaign_sync_snapshots", "Meta sync snapshot schema", "launch success can persist fresh Meta confirmation snapshots");
  assertIncludes(metaSyncOptimizationMigration, "create table if not exists public.campaign_action_suggestions", "Campaign action schema", "post-sync optimization suggestions have a durable table");
  assertIncludes(metaSyncOptimizationMigration, "campaign_sync_snapshots_member_insert", "Meta sync authenticated insert policy", "signed-in launch users can record their own sync snapshots without service-role exposure");

  assertIncludes(launchRoute, "validateExistingMetaObject", "Meta object validation before reuse", "existing Meta IDs are validated before reuse");
  assertIncludes(launchRoute, "fetchMetaObjectByName", "Deterministic Meta lookup", "Meta objects are recovered by deterministic name");
  assertIncludes(launchRoute, "step_status", "Step-level launch state", "launch_runtime stores step_status");
  assertIncludes(launchRoute, "const destinationUrl = publicSlug ? expectedDestinationUrl : \"\";", "Launch destination slug fallback", "published public slug is the launch destination source of truth when saved payloads are stale");
  assertIncludes(launchRoute, "getRecoverablePublicSlug", "Launch slug recovery", "launch runtime updates recover and preserve the published slug instead of erasing it");
  assertIncludes(launchRoute, ".select(\"plan,public_slug,publish_state,published_snapshot,staged_snapshot\")", "Launch slug row fields", "launch recovery loads row publish fields instead of only the stale plan JSON");
  assertIncludes(launchRoute, "getNestedText(snapshot, [\"name\"])", "Launch snapshot name fallback", "published snapshots without publish.slug can recover the public slug from snapshot name");
  assertIncludes(launchRoute, "currentPlan.public_slug", "Launch current-plan slug source", "Meta launch can use the recovered plan slug when the canonical campaign record is stale");
  assertIncludes(launchRoute, "persistRecoveredPublicSlug", "Launch slug self-heal", "Meta launch repairs the missing public_slug row before provider calls need the public funnel URL");
  assertIncludes(launchRoute, "getStaticCreativeReadiness", "Launch image quality gate", "Meta launch refuses selected images that fail the text-free background contract");
  assertIncludes(launchRoute, "selected_ad_image_not_launch_ready", "Launch bad image failure code", "Meta launch fails closed when the selected creative image is not launch-ready");
  assertIncludes(selectAdRoute, "selected_ad_not_launch_safe", "Select-ad image quality gate", "creative selection rejects generated images that are unsafe for launch");
  assertIncludes(selectAdRoute, "isLaunchReadyStaticCreative", "Select-ad visual contract", "creative selection applies the same text-free generated image contract before saving launch choices");
  assertIncludes(selectAdRoute, "assertCampaignCanLaunch", "Select-ad billing entitlement gate", "inactive or unpaid customers cannot approve a creative launch set");
  assertIncludes(creativeWizard, "Full-resolution creative files stay inside this workspace", "Creative no-download policy copy", "customer creative workspace explains raw creative files stay inside DealFlow");
  assertIncludes(buildCreativesPage, "mapVideoCreativeAssets", "Creative Studio current video asset read", "Creative Studio reads current video creative_assets instead of stale campaign-plan video concepts");
  assertIncludes(buildCreativesPage, "persistedVideoAds = mappedVideoAssets", "Creative Studio video asset precedence", "current playable UGC assets win over stale generating plan state");
  assertIncludes(staticCreativePreviewCard, "Full-resolution creative files stay inside this workspace and are used through the launch workflow", "Creative direct-file copy", "customer preview cards avoid presenting generated files as raw files");
  assertExcludes(creativeWizard, /Download|Save Image|Open original|Copy URL|Export/, "Creative wizard download affordances absent", "customer creative workspace does not expose direct download/export/copy-url actions");
  assertIncludes(creativeWizard, "controlsList=\"nodownload noplaybackrate\"", "Creative video no-download controls", "customer video previews request native controls without download affordances");
  assertIncludes(previewPage, "controlsList=\"nodownload noplaybackrate\"", "Preview video no-download controls", "customer preview page requests native controls without download affordances");
  assertIncludes(launchRoute, "testModeInterruptAfter", "Forced interruption support", "forced interruption mode exists");
  assertIncludes(launchRoute, "ALLOW_META_LAUNCH_INTERRUPTION_TESTS", "Legacy launch interruption guard", "legacy campaign create launch path uses the same env gate as the launch route");
  assertIncludes(launchRoute, "handleApiError(error, \"Campaign create launch\")", "Legacy launch safe errors", "legacy campaign create launch path wraps parsing and CSRF failures in safe API errors");
  assertIncludes(launchApiRoute, "test_mode_interrupt_after", "Forced interruption launch API", "launch route forwards interruption mode");
  assertIncludes(launchApiRoute, "assertCampaignCanLaunch(id)", "Launch billing gate", "launch route enforces campaign-scoped subscription/admin override gate");
  assertIncludes(launchApiRoute, "acquireMetaLaunchLock", "Durable Meta launch lock", "launch route uses DB-backed launch locking");
  assertIncludes(launchApiRoute, "ALLOW_META_LAUNCH_INTERRUPTION_TESTS", "Interruption guard", "forced interruption is env-gated");
  assertIncludes(metaExecution, "return \"PAUSED\"", "Meta objects remain paused", "shared Meta execution mapper never emits ACTIVE during beta");
  assertIncludes(metaExecution, "ALLOW_META_LIVE_LAUNCH", "Meta live launch kill switch", "live execution mode requires an explicit owner-controlled env flag");
  assertIncludes(metaPayloadGuardrails, "buildMetaMarketGeoLocations", "Meta market targeting guardrail", "Meta launch targets the exact campaign market instead of a whole country");
  assertIncludes(metaPayloadGuardrails, "meta_market_too_broad", "Meta country-wide targeting block", "Meta launch fails closed when a market is only a country");
  assertIncludes(metaPayloadGuardrails, "contextual_multi_ads", "Meta multi-advertiser opt-out", "Meta creative payloads explicitly opt out of multi-advertiser ads");
  assertIncludes(metaPayloadGuardrails, "standard_enhancements", "Meta creative enhancement opt-out", "Meta creative payloads explicitly opt out of standard enhancements");
  assertIncludes(metaExecution, "geo_locations: buildMetaMarketGeoLocations(adSet.location)", "Shared Meta exact market targeting", "shared Meta execution mapper does not include country-wide targeting");
  assertIncludes(launchRoute, "geo_locations: buildGeoTargeting(location)", "Direct launch exact market targeting", "direct Meta launch route does not include country-wide targeting");
  assertIncludes(metaLaunchService, "applyMetaCreativeOptOut", "Last-mile Meta creative opt-out", "Meta launch service enforces creative opt-out before provider calls");
  assertIncludes(metaLaunchService, "forcePausedPayload", "Direct Meta payload pause guard", "direct Meta launch creation forces PAUSED payloads");
  assertIncludes(metaLaunchService, "meta_active_status_blocked", "Direct Meta ACTIVE block", "direct Meta launch rejects active object payloads");
  assertIncludes(metaLaunchService, "status: \"paused\"", "Meta publish activation disabled", "publish step reports paused instead of activating Meta objects");
  assertIncludes(metaConnect, "value.startsWith(\"//\")", "Meta OAuth return path guard", "protocol-relative return paths are rejected");
  assertIncludes(metaConnect, "createMetaOAuthState", "Meta OAuth signed state", "connect route sends a short-lived signed state instead of relying only on hostname cookies");
  assertIncludes(metaCallback, "resolved.origin === appOrigin", "Meta OAuth callback origin guard", "callback redirects stay on the app origin");
  assertIncludes(metaCallback, "verifyMetaOAuthState", "Meta OAuth state fallback", "callback can safely verify state when a provider returns on an alternate app hostname");
  assertIncludes(metaCallback, "verifiedState?.organizationId", "Meta OAuth workspace fallback", "signed state preserves workspace ownership if auth cookies are unavailable on callback host");
  assertIncludes(metaCallback, "method: \"POST\"", "Meta OAuth token POST", "token exchange avoids putting app secret and code in the request URL");
  assertIncludes(metaCallback, "application/x-www-form-urlencoded", "Meta OAuth form body", "token exchange sends credentials in an encoded form body");
  assertIncludes(metaCallback, "preservedConnectionMetadata", "Meta reconnect metadata preservation", "callback preserves selected Meta asset metadata before refreshing the OAuth token");
  assertIncludes(metaCallback, "...preservedConnectionMetadata", "Meta token refresh metadata merge", "token refresh does not wipe selected account, Page, pixel, or discovery metadata");
  assertIncludes(metaOauthState, "timingSafeEqual", "Meta OAuth state timing-safe compare", "state signatures are compared without string equality leaks");
  assertIncludes(metaOauthState, "STATE_TTL_MS = 10 * 60 * 1000", "Meta OAuth state expiry", "signed OAuth state is short-lived");

  assertExcludes(launchRoute, /accounts\[0\]|pages\[0\]|pixels\[0\]/, "No first-asset fallback in launch execution", "launch route has no accounts[0]/pages[0]/pixels[0]");
  assertIncludes(metaCallback, "asset_discovery", "Meta discovery state tracking", "callback stores partial discovery status");

  assertIncludes(leadForm, "Please provide email or phone", "Lead form client validation", "lead form blocks submit without email or phone");
  assertIncludes(leadRoute, "consumeRateLimit", "Lead capture rate limiting", "lead capture rate limiting enabled");
  assertIncludes(leadRoute, "lead-capture:campaign-ip", "Lead capture campaign+IP limit", "public lead capture rate limit is caller-aware");
  assertIncludes(leadRoute, "lead-capture:contact", "Lead capture contact limit", "public lead capture has contact-hash abuse control");
  assertIncludes(rateLimitHelpers, "getHashedRateLimitIdentifier(getRequestIp(request))", "Rate limit fallback privacy", "default rate-limit keys hash fallback IP addresses before logging or storage");
  assertIncludes(leadRoute, "lead_spam_rejected", "Lead capture honeypot/timing guard", "public lead capture rejects obvious bot submissions");
  assertIncludes(leadRoute, "TURNSTILE_SECRET_KEY", "Lead capture Turnstile server gate", "Cloudflare Turnstile verification is enforced when the secret env var is configured");
  assertIncludes(leadRoute, "return process.env.NODE_ENV !== \"production\";", "Lead capture Turnstile production guard", "production lead capture fails closed if Turnstile is not configured");
  assertExcludes(leadRoute, "ALLOW_PUBLIC_LEAD_NO_TURNSTILE", "Lead capture public bypass removed", "production public lead capture cannot bypass Turnstile through an env flag");
  assertIncludes("scripts/smoke-test.mjs", "SMOKE_ALLOW_SAFE_VALID_LEAD_PROOF", "Production smoke live-lead guard", "standard production smoke does not create a real lead unless an explicit safe proof flag is set");
  assertIncludes("scripts/smoke-test.mjs", "Valid lead submission skipped by default", "Production smoke live-lead skip copy", "missing valid-lead proof is informational instead of a product warning");
  assertIncludes(leadRoute, "https://challenges.cloudflare.com/turnstile/v0/siteverify", "Lead capture Turnstile siteverify", "public lead capture verifies Turnstile tokens server-side");
  assertIncludes(leadForm, "NEXT_PUBLIC_TURNSTILE_SITE_KEY", "Lead form Turnstile client gate", "public lead form renders Turnstile only when the public site key is configured");
  assertIncludes(leadForm, "submitInFlightRef", "Lead form duplicate submit guard", "public lead form synchronously blocks rapid duplicate submits");
  assertIncludes(leadForm, "data?.success !== true || data?.ok !== true", "Lead form confirmed-success redirect guard", "public lead form redirects only after confirmed lead-capture success");
  assertIncludes(leadForm, "window.location.assign(thankYouUrl.toString())", "Lead form thank-you redirect", "successful public lead submissions route to a dedicated next-step page");
  assertIncludes(loginForm, "supabase.auth.signInWithPassword({\n          email,\n          password,\n          options:", "Signin Turnstile token support", "Supabase Auth password sign-in can receive a Turnstile token");
  assertIncludes(loginForm, "captchaToken", "Signup Turnstile token support", "Supabase Auth CAPTCHA can receive a Turnstile token during account creation");
  assertIncludes(loginForm, "resetPasswordForEmail", "Forgot password support", "login page can request a Supabase password reset link");
  assertIncludes(loginForm, "PASSWORD_RECOVERY", "Password recovery completion", "login page handles Supabase recovery sessions");
  assertIncludes(loginForm, "NEXT_PUBLIC_ENABLE_GOOGLE_AUTH", "Google auth feature gate", "Google OAuth button is hidden unless Supabase Google provider is intentionally enabled");
  assertIncludes(loginForm, "GOOGLE_AUTH_ENABLED &&", "Google auth disabled-safe UI", "disabled Supabase Google provider cannot expose a broken OAuth button");
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
  assertIncludes(campaignEntitlements, "evaluateCampaignEntitlements", "Subscription lifecycle policy", "billing states resolve through one campaign entitlement policy");
  assertIncludes(campaignEntitlements, "grace_period", "Cancel-at-period-end grace", "canceled subscriptions remain operational until paid period end");
  assertIncludes(campaignEntitlements, "payment_issue", "Payment issue grace state", "past-due workspaces warn and block launch without immediate hard suspension");
  assertIncludes(campaignEntitlements, "requiresSuspension", "Suspension signal", "ended or unpaid billing produces a single suspension signal");
  assertIncludes(subscriptionSuspensionService, "subscription_suspension", "Subscription suspension job", "inactive subscriptions queue idempotent campaign suspension jobs");
  assertIncludes(subscriptionSuspensionService, "runtime.campaignId", "Managed Meta campaign target", "subscription suspension only reads stored DealFlow campaign object ids");
  assertIncludes(subscriptionSuspensionService, "runtime.metaAdSetIds", "Managed Meta ad set target", "subscription suspension only reads stored DealFlow ad set ids");
  assertIncludes(subscriptionSuspensionService, "runtime.metaAdIds", "Managed Meta ad target", "subscription suspension only reads stored DealFlow ad ids");
  assertIncludes(subscriptionSuspensionService, "status: \"PAUSED\"", "Meta suspension pause action", "subscription suspension pauses instead of deleting Meta objects");
  assertIncludes(subscriptionSuspensionService, "queueCampaignOffboardingCleanupJobsForOrganization", "Offboarding cleanup enqueue", "ended subscriptions queue a separate cleanup job after suspension instead of deleting inline");
  assertIncludes("src/lib/services/campaign-offboarding-cleanup-service.ts", "campaign_offboarding_cleanup", "Campaign offboarding cleanup job", "ended subscriptions clean up DealFlow-created assets through a dedicated worker job");
  assertIncludes("src/lib/services/campaign-offboarding-cleanup-service.ts", "isMetaOffboardingDeletionEnabled", "Meta offboarding deletion kill switch", "Meta campaign-tree deletion is explicitly env-gated");
  assertIncludes("src/lib/services/campaign-offboarding-cleanup-service.ts", "isCreativeStorageOffboardingDeletionEnabled", "Storage offboarding deletion kill switch", "creative storage deletion is explicitly env-gated");
  assertIncludes("src/lib/services/campaign-offboarding-cleanup-service.ts", "selectedLaunchMediaAudit", "Offboarding selected media audit", "offboarding clears active selected creatives while preserving historical selected IDs");
  assertIncludes("src/lib/services/campaign-offboarding-cleanup-service.ts", "skipped_reactivated", "Offboarding reactivation abort", "cleanup rechecks billing and aborts if the subscription is reactivated");
  assertIncludes(systemJobService, "SUBSCRIPTION_GATED_JOB_KINDS", "Inactive workspace job gate", "provider and optimization jobs are skipped when billing is suspended");
  assertIncludes(systemJobService, "runSubscriptionSuspensionJob", "Suspension worker processor", "system job worker can process subscription suspension jobs");
  assertIncludes(systemJobService, "runCampaignOffboardingCleanupJob", "Offboarding worker processor", "system job worker can process campaign offboarding cleanup jobs");
  assertIncludes(leadRoute, "campaign_subscription_inactive", "Lead capture billing gate", "public lead capture rejects suspended campaigns before creating leads");
  assertIncludes(dashboardPage, "Campaign infrastructure is paused", "Dashboard suspended state", "dashboard explains read-only reactivation state");
  assertIncludes(publishRoute, "assertCampaignCanPublishFunnel", "Funnel publish billing gate", "inactive workspaces cannot republish suspended funnels");
  assertIncludes(optimizeRoute, "assertCampaignCanRunOptimization", "Optimization billing gate", "optimization recommendations stop when billing is inactive");
  assertIncludes(activationTelemetryMigration, "create table if not exists public.activation_events", "Activation telemetry durable table", "first-value events persist to Supabase");
  assertIncludes(activationTelemetryMigration, "activation_events_org_event_key_unique", "Activation telemetry idempotency", "activation events dedupe by organization and event key");
  assertIncludes(activationTelemetryMigration, "force row level security", "Activation telemetry RLS", "activation telemetry table is force-RLS protected");
  assertIncludes(activationTelemetryService, "FORBIDDEN_METADATA_KEY", "Activation telemetry privacy scrubber", "activation metadata strips PII/secrets/provider tokens");
  assertIncludes(activationTelemetryService, "recordActivationEvent", "Activation telemetry central helper", "activation writes go through one server helper");
  assertIncludes(activationTelemetryService, "loadActivationStallIssues", "Activation stall operator summary", "operator radar can show slow activation");
  assertIncludes(activationTelemetryRoute, "assertSameOriginRequest", "Activation telemetry same-origin guard", "client-side activation writes reject cross-site POSTs");
  assertIncludes(activationTelemetryRoute, "getAuthenticatedContext", "Activation telemetry auth guard", "client-side activation writes require auth");
  assertIncludes(onboardingPage, "onboarding_step_completed", "Activation onboarding step telemetry", "wizard records completed steps");
  assertIncludes(onboardingRoute, "campaign_plan_persisted", "Activation campaign persistence telemetry", "onboarding route records campaign persistence");
  assertIncludes(previewPage, "preview_generated_or_viewed", "Activation preview telemetry", "preview page records the pre-payment value moment");
  assertIncludes(billingCheckoutRoute, "checkout_started", "Activation checkout telemetry", "checkout handoff is tracked safely");
  assertIncludes(dashboardPage, "dashboard_viewed", "Activation dashboard telemetry", "dashboard preview is tracked");
  assertIncludes(internalLaunchMonitor, "source: \"activation\"", "Activation operator radar integration", "activation stalls are included in operator issues");
  assertIncludes(campaignValueReportMigration, "create table if not exists public.campaign_value_reports", "Campaign value report durable table", "weekly value report snapshots persist to Supabase");
  assertIncludes(campaignValueReportMigration, "force row level security", "Campaign value report RLS", "report snapshots are force-RLS protected");
  assertIncludes(campaignValueReportBuilder, "buildCampaignProgressReport", "Campaign value report deterministic builder", "report generation is deterministic and provider-free");
  assertIncludes(campaignValueReportBuilder, "recentLeadStatuses", "Campaign value report PII-safe lead summary", "reports summarize lead status without raw contact details");
  assertIncludes(campaignValueReportService, "report_table_missing", "Campaign value report migration-safe persistence", "dashboard does not break if report migration is not applied yet");
  assertIncludes(dashboardPage, "buildCampaignProgressReport", "Dashboard value report generation", "dashboard builds the customer-facing value report without mutating data on GET");
  assertExcludes(dashboardPage, "buildAndPersistCampaignValueReport", "Dashboard GET persistence avoided", "dashboard page load does not upsert value reports");
  assertIncludes(dashboardPage, "valueReport={state.valueReport}", "Dashboard value report rendering", "dashboard passes the customer-facing report into the UI");
  assertIncludes("src/components/dashboard/campaign-dashboard-view.tsx", "Weekly value report", "Customer-facing weekly value report UI", "dashboard shows recurring campaign progress value");
  assertIncludes(internalLaunchMonitor, "source: \"value_report\"", "Value report operator radar integration", "operator issues include stale or missing value reports");
  assertIncludes(billingCancellationIntentMigration, "create table if not exists public.billing_cancellation_intents", "Billing cancellation intent durable table", "local manage/cancel intent is captured before Stripe Portal");
  assertIncludes(billingCancellationIntentMigration, "force row level security", "Billing cancellation intent RLS", "cancellation intent rows are force-RLS protected");
  assertIncludes(billingCancellationIntentRoute, "assertSameOriginRequest", "Billing cancellation intent same-origin guard", "cancellation intent capture rejects cross-site POSTs");
  assertIncludes(billingCancellationIntentRoute, "recordBillingCancellationIntent", "Billing cancellation intent route helper", "intent route records app-side reason without mutating Stripe subscriptions");
  assertIncludes(billingRecoveryService, "loadBillingRecoveryIssues", "Billing recovery operator issues", "operator radar includes payment issue, cancel-at-period-end, and suspended billing states");
  assertIncludes(billingRecoveryService, "payment_issue", "Payment issue operator signal", "past-due workspaces produce a recovery issue instead of silent churn");
  assertIncludes(billingRecoveryService, "cancel_at_period_end", "Cancel-at-period-end operator signal", "scheduled cancellations stay visible while access remains active");
  assertIncludes(billingRecoveryService, "requiresSuspension", "Suspended billing operator signal", "ended subscriptions surface as suspended infrastructure issues");
  assertIncludes(billingRecoveryService, "Stripe remains the payment source of truth", "Stripe source-of-truth cancellation policy", "DealFlow records intent but does not implement custom cancellation mutation");
  assertIncludes(billingCancellationIntentForm, "Continue to Stripe Portal", "Cancellation reason portal handoff", "settings collects an optional reason before Stripe Portal without blocking cancellation");
  assertIncludes(billingCancellationIntentForm, "Skip reason", "Cancellation no-dark-pattern path", "customer can skip reason and still open Stripe Portal");
  assertIncludes(internalLaunchMonitor, "source: \"billing_recovery\"", "Billing recovery operator radar integration", "payment issue and cancellation risks are included in operator issues");
  assertIncludes(customerSuccessMigration, "create table if not exists public.customer_success_checklists", "Customer success checklist durable table", "operator completion timestamps can persist without a full business OS");
  assertIncludes(customerSuccessMigration, "force row level security", "Customer success checklist RLS", "checklist rows are force-RLS protected");
  assertIncludes(customerSuccessService, "loadCustomerSuccessChecklistRows", "Customer success checklist builder", "command center can derive per-campaign first-25-day checklist status");
  assertIncludes(customerSuccessService, "day_7_check_in", "Day 7 customer success check", "checklist includes day 7 check-in due");
  assertIncludes(customerSuccessService, "day_14_value_proof", "Day 14 customer success proof", "checklist includes day 14 value proof due");
  assertIncludes(customerSuccessService, "day_25_renewal_risk_review", "Day 25 renewal risk review", "checklist includes day 25 renewal-risk review due");
  assertIncludes(internalLaunchMonitor, "source: \"customer_success\"", "Customer success operator radar integration", "overdue or at-risk checklist rows appear in operator issues");
  assertIncludes(commandCenterPage, "loadCustomerSuccessChecklistRows", "Command center customer success data", "operator command center loads customer-success checklist rows");
  assertIncludes(commandCenterConsole, "Customer-success watchlist", "Command center customer success UI", "operator command center renders the customer-success watchlist");
  assertIncludes(commandCenterPage, "assertInternalOperatorAccess", "Command center operator export gate", "operator export controls live behind the internal admin access gate");
  assertIncludes(adminIssuesPage, "assertInternalOperatorAccess", "Issue export operator gate", "downloadable operator issue prompts require internal admin access");
  assertIncludes(commandCenterConsole, "Export issues", "Operator issue export retained", "operator issue export remains available only on the admin command center");
  assertIncludes(supportCategories, "creative_generation_issue", "Support creative generation category", "customer support can be categorized for creative generation routing");
  assertIncludes(supportCategories, "billing_help", "Support billing category", "billing support is routed separately");
  assertIncludes(supportRoute, "category: body.category", "Support category event logging", "support logs the category without raw submitted notes");
  assertIncludes(clientErrorMigration, "create table if not exists public.client_error_events", "Client error durable table", "browser crashes persist to a server-owned table");
  assertIncludes(clientErrorMigration, "force row level security", "Client error forced RLS", "client error telemetry table is force-RLS protected");
  assertIncludes(clientErrorRoute, "assertSameOriginRequest", "Client error same-origin guard", "browser error telemetry rejects cross-site POSTs");
  assertIncludes(clientErrorRoute, "consumeRateLimit", "Client error rate limit", "browser error telemetry is rate limited");
  assertIncludes(clientErrorListener, "unhandledrejection", "Unhandled rejection listener", "global browser promise rejections are captured");
  assertIncludes(clientErrorListener, "window.addEventListener(\"error\"", "Window error listener", "global browser errors are captured");
  assertIncludes(clientErrorService, "FORBIDDEN_TEXT_PATTERN", "Client error privacy scrubber", "browser error messages/stacks are scrubbed before persistence");
  assertIncludes(internalLaunchMonitor, "source: \"client_error\"", "Client error operator radar integration", "browser crashes appear in operator issues");
  assertIncludes(safeE2eConfig, "screenshot: \"off\"", "Safe E2E screenshot disabled", "browser proof avoids screenshot artifacts with private data");
  assertIncludes(safeE2eConfig, "ALLOW_META_LIVE_LAUNCH", "Safe E2E Meta launch disabled", "browser proof starts local app with live Meta launch disabled");
  assertIncludes(safeE2eSpec, "SAFE_E2E_QA_AUTH", "Safe E2E QA auth gate", "authenticated browser journey requires an explicit QA auth env gate");
  assertIncludes(safeE2eSpec, "/api/internal/qa-auth-session", "Safe E2E internal auth harness", "browser proof uses the env-gated internal QA auth harness");
  assertIncludes("src/app/api/internal/qa-auth-session/route.ts", "QA_AUTH_HARNESS_PRODUCTION_ENABLED", "Production QA harness gate", "QA session minting requires a second explicit production gate");
  assertIncludes("src/app/api/internal/qa-auth-session/route.ts", "type: \"email\"", "QA auth token verification", "generated Supabase email tokens are verified server-side without relying on CAPTCHA-protected password sign-in");
  assertIncludes(safeE2eSpec, "No live ad, payment, message, or media action runs here.", "Safe E2E live-action boundary assertion", "browser proof asserts onboarding warns that no live ad, payment, message, or media action runs");
  assertIncludes("scripts/smoke-test-system.md", "npm run test:e2e:safe", "Safe browser E2E docs", "smoke documentation includes the safe browser proof command");
  assertExcludes("src/lib/services/lead-handler-service.ts", /QA_EMAIL|QA_PASSWORD/, "QA credential fallback removed", "no QA credential fallback remains in lead handler");
  assertIncludes(campaignPlanPersistence, "organization_id: params.ownerId", "Campaign persistence organization ownership", "fresh campaign rows persist organization_id for downstream jobs and billing");
  assertIncludes("scripts/check-rls-cross-tenant.mjs", "RLS_USER_A_JWT", "Cross-tenant RLS smoke script", "operator can prove User A cannot read User B fixtures");
  assertIncludes("scripts/check-rls-cross-tenant.mjs", "run-rls-fixture-smoke.mjs", "Ephemeral RLS JWT mode", "cross-tenant RLS proof can mint short-lived fixture sessions instead of requiring static JWT secrets");
  assertIncludes("scripts/check-rls-cross-tenant.mjs", "expectRpcDenied", "Internal RPC denial smoke script", "operator can prove internal RPCs are not executable by anon/authenticated clients");

  assertIncludes(apiRouteHelpers, "assertSameOriginRequest", "Same-origin mutation guard helper", "sensitive authenticated POST routes can reject cross-site requests");
  assertIncludes(apiRouteHelpers, "if (!candidate)", "Same-origin missing-header rejection", "same-origin guard rejects unsafe requests that omit Origin and Referer");
  assertIncludes(apiRouteHelpers, "error.status >= 500", "Production 5xx API redaction", "production server errors do not return raw database or provider failure messages");
  assertIncludes(apiRouteHelpers, "!error.code.startsWith(\"video_\")", "Video safe-error exception", "video rendering keeps curated safe blocker copy while other 5xx messages are redacted in production");
  assertIncludes(middleware, "script-src-attr 'none'", "CSP inline attribute hardening", "production CSP blocks inline event-handler attributes");
  assertIncludes(middleware, "upgrade-insecure-requests", "CSP production upgrade directive", "production CSP upgrades insecure subresource requests");
  assertIncludes(middleware, "isProduction ? [] : [\"'unsafe-eval'\"]", "CSP production unsafe-eval removal", "unsafe-eval is only permitted outside production");
  assertIncludes(onboardingRoute, "assertSameOriginRequest", "Onboarding same-origin guard", "onboarding POST rejects cross-site requests");
  assertIncludes("src/app/api/campaigns/[id]/select-ad/route.ts", "assertSameOriginRequest", "Selected creative same-origin guard", "selected creative writes reject cross-site requests");
  assertIncludes("src/app/api/campaigns/[id]/select-ad/route.ts", "organization_id", "Selected creative ownership guard", "selected creative writes verify campaign ownership");
  assertIncludes(launchRoute, "ownershipVerified", "Meta failure persistence ownership guard", "direct Meta launch route does not persist failure state before ownership is proven");
  assertIncludes(campaignPlanPersistence, "preserveExistingCriticalFieldsForPlanUpdate", "Campaign public slug preservation", "asset-only plan updates preserve an existing row public slug when older plan JSON lacks one");
  assertIncludes(campaignPlanPersistence, "existing.public_slug", "Campaign public slug fallback", "public slug projection is not cleared by static creative regeneration on older published campaigns");
  assertIncludes(campaignPlanPersistence, "requiresPublicSlugForLaunchStatus", "Campaign public slug warning scope", "pre-launch built campaigns do not emit public_slug warnings before the funnel is published or launched");
  assertIncludes(createCampaignRoute, "meta_paused_verification_failed", "Direct Meta paused verification", "direct Meta launch route verifies or restores PAUSED after create/recovery");
  assertIncludes(billingCheckoutRoute, "assertSameOriginRequest", "Billing checkout same-origin guard", "checkout route rejects cross-site POSTs");
  assertIncludes(billingPlans, "priceLabel: \"$147/mo\"", "Starter price updated", "Starter self-serve plan is priced at $147/month");
  assertIncludes(billingPlans, "priceLabel: \"$297/mo\"", "Pro price contract", "Pro self-serve plan is priced at $297/month");
  assertExcludes(billingPlans, "priceLabel: \"$97/mo\"", "Legacy Starter price removed", "old Starter pricing is not treated as the public pricing contract");
  assertIncludes(billingPlans, "meta_launch: \"starter\"", "Starter Meta launch access", "Starter plan grants Meta launch access while Pro remains autonomy tier");
  assertIncludes(billingPlans, "autonomy_access: \"pro\"", "Pro autonomy access", "autonomous operator access remains Pro-gated");
  assertIncludes("src/app/api/autonomy/_shared.ts", "getCampaignEntitlementsForCampaign(plan.id)", "Autonomy API entitlement guard", "autonomy recommendations load entitlements before selecting recommendation-only or Pro execution mode");
  assertIncludes("src/app/api/autonomy/run/route.ts", "assertAutonomyExecutionAccess(result.campaignId)", "Autonomy run entitlement guard", "autonomy execution cannot run unless the campaign has Pro autonomy access");
  assertIncludes(billingCheckoutRoute, "campaignId", "Checkout campaign handoff", "billing checkout accepts campaign id for post-checkout dashboard routing");
  assertIncludes(billingPortalRoute, "assertSameOriginRequest", "Billing portal same-origin guard", "portal route rejects cross-site POSTs");
  assertIncludes(stripeProvider, "create_billing_portal_session", "Stripe portal provider support", "billing portal sessions are created through the Stripe provider");
  assertIncludes(stripeService, "session_id={CHECKOUT_SESSION_ID}", "Stripe checkout success session id", "checkout success redirects carry the Stripe session id");
  assertIncludes(stripeService, "campaignId", "Stripe checkout campaign return", "checkout success/cancel URLs preserve the campaign id");
  assertIncludes(stripeProvider, "retrieve_checkout_session", "Stripe checkout retrieval support", "checkout sessions can be verified server-side after redirect");
  assertIncludes(billingService, "reconcileBillingCheckoutSuccess", "Stripe checkout success reconciliation", "unlock success can sync subscription state if webhooks lag");
  assertIncludes(billingService, "billing_checkout_session_reused", "Stripe checkout duplicate-session reuse", "recent open checkout sessions are reused instead of duplicated");
  assertIncludes(billingService, "last_checkout_campaign_id", "Stripe checkout campaign-scoped reuse", "recent open checkout sessions are reused only for the same campaign id");
  assertIncludes(billingService, "reusableSession.metadata?.campaign_id", "Stripe checkout session metadata guard", "stored checkout sessions must match requested campaign metadata before reuse");
  assertIncludes(billingService, "checkout_campaign_invalid", "Stripe checkout campaign ownership guard", "checkout rejects stale or unowned campaign ids before creating Stripe sessions");
  assertIncludes(billingService, "requestedCampaignId ?? \"workspace\"", "Stripe checkout idempotency campaign scope", "subscription checkout idempotency keys are scoped by campaign id");
  assertIncludes(billingService, "checkout_session_stale", "Stripe stale checkout reconciliation guard", "older parallel checkout sessions cannot unlock access");
  assertIncludes(envHelpers, "ALLOW_BILLING_ADMIN_OVERRIDE", "Billing admin override env gate", "internal launch override requires explicit env opt-in");
  assertIncludes(envHelpers, "BILLING_ADMIN_OVERRIDE_EMAILS", "Billing-only override allowlist", "billing override can be scoped without granting operator admin access");
  assertIncludes(envHelpers, "ALLOW_QA_BILLING_ACCEPTANCE_OVERRIDE", "QA billing acceptance env gate", "owner/test billing acceptance requires explicit env opt-in");
  assertIncludes(envHelpers, "QA_BILLING_ACCEPTANCE_OVERRIDE_CAMPAIGN_IDS", "QA billing campaign allowlist", "owner/test billing acceptance can be scoped to a single campaign");
  assertIncludes(envHelpers, "QA_BILLING_ACCEPTANCE_OVERRIDE_PLAN_TIERS", "QA billing plan allowlist", "owner/test billing acceptance is constrained by explicit plan tier");
  assertIncludes(creditService, "DEFAULT_GENERATION_CREDIT_OVERDRAFT_LIMIT_CENTS = 0", "Strict prepaid credit default", "self-serve paid generation is prepaid by default");
  assertIncludes(creditService, "GENERATION_CREDIT_OVERDRAFT_LIMIT_CENTS", "Credit overdraft cap env", "any generation-credit overdraft requires an explicit operator env override");
  assertIncludes("supabase/migrations/20260510183000_cap_generation_credit_overdrafts.sql", "next_balance < -overdraft_limit", "DB credit overdraft cap", "database credit consumption enforces a maximum negative balance");
  assertIncludes(".env.example", "INTERNAL_SYSTEM_JOBS_SECRET", "Internal runner env example", "cron runner secret is documented in the environment template");
  assertIncludes(".env.example", "CRON_SECRET", "Vercel cron env example", "Vercel Cron secret fallback is documented in the environment template");
  assertIncludes(envHelpers, "getInternalSystemJobSecrets", "Internal runner accepts multiple secrets", "system job runner can accept both internal runner and Vercel Cron bearer secrets");
  assertIncludes(middleware, "getInternalSystemJobSecrets", "Internal proxy accepts multiple secrets", "internal API middleware accepts the same runner/cron secret set as the route guard");
  assertIncludes(billingService, "isBillingAdminOverrideEmail(email) ? email : null", "Billing-only override check", "billing override requires the billing-specific email allowlist");
  assertExcludes(billingService, "isInternalAdminEmail(email)", "Billing override admin fallback removed", "internal admin access no longer automatically grants billing launch access");
  assertIncludes(campaignEntitlements, "isBillingAdminOverrideEmail(email)", "Campaign entitlement billing override", "campaign launch entitlements use the billing-specific override allowlist");
  assertIncludes(campaignEntitlements, "qa_billing_acceptance", "QA billing acceptance entitlement source", "owner/test billing acceptance is auditable and distinct from Stripe-active billing");
  assertIncludes(campaignEntitlements, "getQaBillingAcceptanceOverrideMatch", "QA billing acceptance matcher", "normal billing remains separate from scoped owner/test overrides");
  assertIncludes(publicFunnelPage, "campaignId: record.campaign.id", "Public funnel campaign billing override", "public funnel lead capture can honor campaign-scoped owner/test billing acceptance without broad org access");
  assertIncludes(publicFunnelPage, "export const dynamic = \"force-dynamic\";", "Public funnel stale cache guard", "public funnels render the latest published snapshot instead of an uninvalidated static cache");
  assertExcludes(publicFunnelPage, "unstable_cache", "Public funnel stale cache avoided", "public funnel route avoids stale cached snapshots without publish-time invalidation");
  assertIncludes(publicFunnelPage, "LEGACY_PUBLIC_FUNNEL_SLUG_REDIRECTS", "Legacy Meta funnel slug redirect", "previously created Meta destinations do not land on a 404 after canonical slug changes");
  assertIncludes(publicFunnelPage, "\"raiaan-realty\": \"raiaan-broker-toronto-on-ccbfbfce\"", "Campaign 345 paid URL redirect", "the known paused-launch destination redirects to the current accepted public funnel");
  assertOrderedIncludes(publicFunnelPage, [
    "const redirectSlug = LEGACY_PUBLIC_FUNNEL_SLUG_REDIRECTS",
    "getPublishedCampaignBySlug(resolvedParams.slug)",
  ], "Legacy funnel redirect preempts lookup", "app-state repairs cannot hijack the paid alias before it redirects to the canonical funnel");
  assertIncludes(launchRoute, "published_funnel_snapshot_stale", "Launch stale snapshot fail-closed code", "direct launch route rejects stale public funnel snapshots before paid traffic");
  assertOrderedIncludes(launchRoute, [
    "assertPublishedFunnelSnapshotMatchesCurrentPlan({",
    "const preflight = await validateMetaLaunchSelections({ destinationUrl });",
  ], "Launch stale snapshot preflight order", "public funnel snapshot consistency is checked before Meta preflight or object creation");
  assertIncludes(launchPage, "publicFunnelSnapshotMatchesCurrentPlan", "Launch stale snapshot UI state", "launch UI tracks whether the public funnel snapshot matches the current campaign plan");
  assertIncludes(launchPage, "Republish the public funnel because the live snapshot no longer matches the current campaign plan.", "Launch stale snapshot customer-safe copy", "launch UI tells operators to republish before sending paid traffic");
  assertIncludes(launchBudgetTrackingSafetyTest, "published_funnel_snapshot_stale", "Launch stale snapshot regression script", "targeted launch budget/tracking test covers stale public funnel snapshots");
  assertIncludes(campaign345RepairScript, "CAMPAIGN_345_REPAIR", "Campaign 345 repair scoped target", "repair tooling keeps campaign 345 identifiers centralized");
  assertIncludes(campaign345RepairScript, "applyAck: \"repair-campaign-345-paused-launch-state\"", "Campaign 345 repair apply ack", "repair apply mode requires the explicit campaign 345 acknowledgement");
  assertIncludes(campaign345RepairScript, "launchReady.length < 4", "Campaign 345 static media floor", "repair tooling blocks selected static repair without enough launch-ready static groups");
  assertIncludes(campaign345RepairScript, "publishedFunnel", "Campaign 345 published snapshot preservation", "repair tooling carries the published funnel snapshot into app state");
  assertIncludes(campaign345RepairTest, "testLegacyPublicFunnelRedirectPreemptsCampaignLookup", "Campaign 345 legacy redirect regression", "campaign 345 repair tests protect the legacy alias redirect order");
  assertIncludes(campaign345RepairTest, "idempotentNoop", "Campaign 345 repair idempotency regression", "campaign 345 repair tests cover idempotent post-apply shape");
  assertIncludes(publicFunnelThankYouPage, "getPublishedCampaignBySlug(resolvedParams.slug)", "Public funnel thank-you lookup", "thank-you pages render from published public funnel records");
  assertIncludes(publicFunnelThankYouPage, "notFound()", "Public funnel thank-you invalid slug guard", "invalid thank-you slugs fail safely");
  assertIncludes(publicFunnelThankYouPage, "view.primaryLink", "Public funnel thank-you booking CTA surface", "thank-you route can show configured booking next step");
  assertIncludes(publicFunnelThankYouPage, "Keep an eye on your phone and email", "Public funnel thank-you expectation copy", "thank-you route sets follow-up expectations");
  assertIncludes(publicFunnelThankYouTracker, "CompleteRegistration", "Public funnel thank-you conversion event", "thank-you route can track a post-submit conversion event");
  assertIncludes(publicFunnelThankYouTracker, "sessionStorage.getItem(storageKey)", "Public funnel thank-you conversion dedupe", "refreshes avoid duplicate thank-you conversion tracking");
  assertIncludes(publicFunnelThankYouModel, "booking_url", "Public funnel thank-you configurable booking URL", "thank-you model supports campaign/funnel booking links when configured");
  assertIncludes(publicFunnelThankYouModel, "url.protocol === \"https:\" || url.protocol === \"http:\"", "Public funnel thank-you safe link policy", "thank-you CTAs only use public http(s) URLs");
  assertIncludes(publicFunnelThankYouModel, "show_thank_you_page_call_5_15_minutes", "Public funnel thank-you follow-up key mapping", "saved machine follow-up keys render as customer-safe next-step copy");
  assertIncludes(billingService, "billing_admin_override_launch_access_granted", "Billing admin override audit log", "override-based launch access grants are audit logged");
  assertIncludes(billingService, "qa_billing_acceptance_override_launch_access_granted", "QA billing acceptance audit log", "owner/test billing override grants are audit logged without faking Stripe subscriptions");
  assertIncludes(launchApiRoute, "assertCampaignCanLaunch(id)", "Campaign-scoped launch billing gate", "launch route applies campaign-scoped owner/test billing acceptance");
  assertIncludes(launchPage, "Owner/test billing acceptance is active for this campaign", "Launch billing override copy", "launch page distinguishes owner/test acceptance from real Stripe subscription state");
  assertIncludes(billingService, "billing_checkout_bypass", "Billing override checkout bypass", "override users do not create live Stripe checkout sessions");
  assertIncludes(paywallPage, "launchOverride={billing?.launchOverride === true}", "Paywall override handoff", "billing override state is passed into the paywall CTA");
  assertIncludes("src/components/billing/paywall-plan-selector.tsx", "Activate {selectedPlan.name}", "Paywall simulated override CTA", "billing override users see normal activation copy without opening Stripe checkout");
  assertIncludes("src/components/billing/paywall-plan-selector.tsx", "label={selectedPlan.checkoutCtaLabel}", "Paywall free-trial checkout CTA", "normal customers see the 7-day free trial checkout copy");
  assertIncludes(unlockPage, "Checkout cancelled", "Unlock cancelled state", "Stripe cancel returns to a clear cancellation state instead of an access-active page");
  assertIncludes(unlockPage, "Back to build", "Unlock cancelled CTA", "cancelled checkout sends the user back to Build instead of dashboard by default");
  assertIncludes(unlockPage, "Welcome to DealFlow OS", "Unlock welcome activation state", "post-checkout activation feels like a customer-facing welcome handoff");
  assertExcludes(unlockPage, "billing override", "Unlock internal override copy hidden", "post-checkout activation does not expose billing override language");
  assertIncludes(unlockPage, "<Link href={creativesHref}>{primaryCreativeLabel}</Link>", "Unlock creative handoff CTA", "post-checkout primary CTA opens the creative generation or selection workspace");
  assertIncludes(unlockPage, "Generate creatives", "Unlock generation CTA copy", "activation handoff can send missing-asset campaigns into creative generation");
  assertExcludes(unlockPage, "dashboardHref", "Unlock dashboard bypass removed", "post-checkout flow does not route directly to dashboard or passive Build by default");
  assertIncludes(builderPage, "href: scoped(\"/build/creatives\")", "Builder creative CTA target", "Builder sends unselected campaigns to the creative workspace instead of refreshing itself");
  assertIncludes(builderPage, "Current next step", "Builder duplicate CTA removed", "campaign slots panel summarizes the next step without adding a second primary CTA loop");
  assertIncludes(buildCreativesPage, "Generate your creative test set", "Creative generation state", "creative workspace has a customer-facing generation state when assets are not ready");
  assertIncludes(buildCreativesPage, "GenerateCreativesPanel", "Creative generation panel", "missing creative campaigns stay on the creative workspace instead of bouncing to Builder");
  assertExcludes(buildCreativesPage, "missingArtifacts", "Creative missing-artifact recovery removed", "customers do not see or trigger technical missing artifact recovery logic");
  assertIncludes(billingService, "apply_billing_subscription_webhook", "Stripe webhook ordering guard", "subscription sync uses DB-backed stale event protection");
  assertIncludes(billingService, "stripe_subscription_stale_event_ignored", "Stripe stale event observability", "out-of-order subscription events are logged and ignored");
  assertIncludes(billingWebhookMigration, "stripe_latest_event_created", "Billing subscription event watermark", "billing rows persist latest Stripe event timestamps");
  assertIncludes(billingOrderingMigration, "stripe_latest_event_id, '') < normalized_event_id", "Billing equal-timestamp ordering guard", "same-second Stripe events are ordered deterministically");
  assertIncludes(creditService, "consume_user_credits", "Atomic credit deduction", "paid generation credits are deducted through a DB RPC");
  assertIncludes(creditService, "assertGenerationCreditsAvailableForUser", "Generation credit preflight", "paid generation routes preflight credits before queueing provider work");
  assertIncludes(creditService, "grant_user_credits", "Credit top-up ledger", "credit grants and refunds use the append-only DB ledger");
  assertIncludes(creditService, "CREDIT_TOP_UP_MINIMUM_CENTS = 1_000", "Credit top-up minimum", "generation credit top-ups require the intended $10 minimum");
  assertIncludes(creditService, "bypassedByBillingOverride", "Credit billing override", "billing override users can test paid generation without internal credit balance friction");
  assertIncludes("src/components/billing/generation-credit-top-up-panel.tsx", "Add $10.00 credits", "Creative top-up prompt", "insufficient generation credits surface a compact $10 top-up action");
  assertIncludes("supabase/migrations/20260510014500_enable_generation_credit_overdrafts.sql", "next_balance := current_balance - p_amount", "Historical credit ledger compatibility", "credit ledger keeps backward-compatible support for prior overdraft-cap migrations");
  assertIncludes(billingService, "checkout_kind: \"credit_top_up\"", "Stripe credit top-up checkout", "credit purchases are isolated from subscription checkout metadata");
  assertIncludes(billingService, "stripe_credit_top_up_processed", "Stripe credit top-up webhook", "paid credit checkout sessions grant credits idempotently");
  assertIncludes(billingService, "payment_method_types: [\"card\"]", "Stripe credit top-up synchronous payment", "credit top-up checkout is card-only so delayed async payment methods do not strand credits");
  assertIncludes(creativeEngine, "provider_usage_context", "Paid static generation guard", "each generated image carries DB-backed provider usage context");
  assertIncludes(creativeEngine, "evaluateStaticCreativeImageQa", "Static generation image QA gate", "provider image output is inspected before it can become a generated static creative");
  assertIncludes(creativeEngine, "getCustomerSafeImageQaMessage", "Static image QA safe message", "rejected provider visuals get customer-safe retry copy");
  assertIncludes(campaignPersistence, "consumeSessionCostBudget", "Paid image call guard", "server-side static generation reserves provider budget before execution");
  assertIncludes(campaignPersistence, "imageQa", "Static image QA readback", "persisted QA decisions are enforced when campaign creatives are loaded");
  assertIncludes(staticAdsRoute, "idempotencyKey", "Static generation idempotency", "paid generation job creation uses idempotency key");
  assertIncludes(envHelpers, "getHiggsfieldEnv", "Higgsfield env helper", "Higgsfield provider credentials and model settings are centralized");
  assertIncludes(envHelpers, "MEDIA_GENERATION_PROVIDER", "Media provider selector", "media generation can select Higgsfield without touching UI flows");
  assertIncludes(envHelpers, "higgsfield_marketing_studio", "Higgsfield Marketing Studio selector", "media generation can select the gated Marketing Studio adapter");
  assertIncludes(imageProvider, "isHiggsfieldImageGenerationEnabled", "Higgsfield image generation kill switch", "paid image provider returns unsupported unless explicitly enabled");
  assertIncludes(imageProvider, "HiggsfieldMarketingStudioImageProvider", "Higgsfield Marketing Studio provider", "static image generation has a gated Marketing Studio provider implementation");
  assertIncludes(imageProvider, "HiggsfieldImageProvider", "Higgsfield image provider", "static image generation has a Higgsfield provider implementation");
  assertIncludes(higgsfieldClient, "@higgsfield/client/v2", "Official Higgsfield SDK", "Higgsfield integration keeps the server-side SDK path available");
  assertIncludes(higgsfieldClient, "generateMarketingStudioImageWithCli", "Official Higgsfield CLI adapter", "Marketing Studio generation can use the official CLI when explicitly enabled");
  assertIncludes(higgsfieldClient, "resolveImageEndpoint", "Higgsfield endpoint mapping", "Higgsfield Cloud model aliases are mapped to supported API endpoints instead of being posted as URL paths");
  assertIncludes(higgsfieldClient, "\"/v1/text2image/soul\"", "Higgsfield Cloud image endpoint", "Marketing Studio image aliases use the supported Cloud text-to-image endpoint");
  assertIncludes(higgsfieldClient, "buildImageInput", "Higgsfield model parameter mapping", "Higgsfield Cloud requests use the selected model's accepted input shape instead of a one-size-fits-all payload");
  assertIncludes(higgsfieldClient, "width_and_height", "Higgsfield image payload", "Higgsfield Cloud image renders send supported Soul text-to-image dimensions");
  assertIncludes(higgsfieldClient, "withPolling: true", "Higgsfield image polling", "image generation waits for a completed result before surfacing a file URL");
  assertIncludes(higgsfieldClient, "withPolling: false", "Higgsfield async video start", "video generation stays async and does not block the request path");
  assertIncludes(launchRoute, "assertMetaLiveLaunchEnabled", "Reachable Meta live launch kill switch", "direct Meta launch route fails closed unless ALLOW_META_LIVE_LAUNCH=true");
  assertIncludes("src/lib/integrations/meta/budget-cap.ts", "/^(0|none|off|unlimited)$/i", "Meta budget unlimited policy", "unset, zero, off, none, or unlimited budget cap config removes the DealFlow cap");
  assertIncludes("src/lib/integrations/meta/budget-cap.ts", "isMetaDailyBudgetCapRequiredForProductionLaunch", "Production budget cap requirement", "production Meta launch approval requires a finite owner-configured cap");
  assertIncludes(metaExecution, "meta_budget_cap_missing", "Live Meta budget cap required", "live Meta launch fails closed when a finite budget cap is missing");
  assertIncludes(metaLaunchService, "getMetaDailyBudgetCapCents()", "Reachable Meta budget policy", "direct Meta launch uses the shared owner-configured budget cap policy");
  assertIncludes(sessionCostGuard, "reserve_provider_usage", "Atomic provider usage reservation", "paid-generation guard reserves provider budget through DB RPC");
  assertIncludes(sessionCostGuard, "HIGGSFIELD_IMAGE_DAILY_LIMIT", "Configurable Higgsfield image cap", "Higgsfield image generation can be capped below the default for production tests");
  assertIncludes(sessionCostGuard, "DURABLE_PROVIDER_USAGE_LIMITS", "Durable provider cap default", "production provider caps allow a full six-creative render plus retries without falling back to the browser-session limit");
  assertIncludes(sessionCostGuard, "maximum: 120", "Durable provider cap ceiling", "production provider caps still have a hard upper safety ceiling");
  assertIncludes(sessionCostGuard, "image_generation", "Generic image generation bucket", "paid image reservations use a provider-neutral operation bucket");
  assertIncludes(creditService, "legacyBucket", "Legacy credit bucket compatibility", "old OpenAI/HeyGen credit metadata remains understandable after provider migration");
  assertIncludes(sessionCostGuard, "provider_usage_idempotency_consumed", "Paid generation duplicate-spend guard", "consumed provider usage reservations fail closed instead of calling the provider again");
  assertIncludes(sessionCostGuard, "consumeCreditsForGeneration", "Provider usage credit coupling", "provider reservations consume credits before paid calls execute");
  assertIncludes(sessionCostGuard, "markSessionCostBudgetEvent({", "Credit failure quota release", "failed credit reservations release provider usage through the shared counter-decrement path");
  assertIncludes(sessionCostGuard, "refundCreditsForProviderUsageEvent", "Credit refund coupling", "released or failed paid calls refund reserved credits");
  assertIncludes(sessionCostGuard, "provider_usage_limit_release_failed", "Released provider usage cap refund", "released provider attempts decrement the durable usage counter instead of exhausting the daily image cap");
  assertIncludes(legacyAiProviders, "providerUsage?.mark", "Provider usage ledger transitions", "paid-generation reservations are marked consumed/released after the provider call");
  assertIncludes(legacyAiProviders, "providerJobWasCreated", "Provider usage pre-job release", "provider attempts that fail before a provider job id is returned release the daily reservation");
  assertIncludes(videoRoute, "getVideoProviderReadiness", "Video generation provider preflight", "disabled or unconfigured video providers are blocked before queueing jobs");
  assertOrderedIncludes(videoRoute, ["const activeJobs", "if (!videoProviderReadiness.ready)", "const job = await createSystemJob"], "Video generation disabled-job guard", "existing active jobs stay visible, but new video jobs are blocked when the provider kill switch is off");
  assertIncludes(videoRoute, "kind: \"video_generation\"", "Video generation job route", "AI video generation is queued through the paid system job path");
  assertIncludes(videoRoute, "getCampaignById", "Video generation ownership guard", "video generation verifies campaign ownership before queueing paid work");
  assertExcludes(videoRoute, "processSystemJob", "Video generation enqueue-only route", "video routes cannot process paid provider jobs without an atomic worker claim");
  assertIncludes(videoRoute, "reusedExistingJob", "Video generation active job reuse", "active pending or processing video jobs are reused for the same creative when safe");
  assertIncludes(videoRoute, "existingActiveJob && body.force !== true", "Video forced retry visibility", "explicit forced video retry can bypass a stale active job instead of hiding permanent deferred state");
  assertIncludes(systemJobService, "video_generation_status", "Video generation status polling", "AI video render completion is polled by durable follow-up jobs instead of blocking the cron worker");
  assertExcludes(staticAdsRoute, "processSystemJob", "Static generation enqueue-only route", "static creative routes cannot process paid provider jobs without an atomic worker claim");
  assertIncludes(staticAdsRoute, "existingActiveJob && body.force !== true", "Static generation active-job reuse", "normal retries reuse active work while explicit forced retries can bypass stale/deferred state");
  assertIncludes(staticAdsRoute, "missingOnly", "Static missing-image retry", "partial creative retries can refill failed/missing images without regenerating the whole test set");
  assertExcludes(creativeEngine, "Promise.all(\n    baseStaticAds", "Static image sequential provider calls", "static image generation no longer launches all provider calls at once when quota is tight");
  assertIncludes(campaignPersistence, "reuse_static_assets", "Static generated-asset reuse", "missing-image retries preserve already generated Higgsfield assets");
  assertIncludes("src/lib/services/asset-generation-lifecycle.ts", "params.missingOnly", "Static missing-image lifecycle bypass", "missing-image retries do not no-op just because an earlier partial render exists");
  assertIncludes(staticCreativeAssetService, "imagePromptConfig", "Static prompt metadata persistence", "saved generated assets keep prompt config and negative prompt guidance for future retries");
  assertIncludes(mediaBuyerFramework, "stripNegativePromptGuidance", "Media buyer quality scoring", "creative quality gates do not punish prompts for anti-patterns listed only as avoid guidance");
  assertIncludes(systemJobStreamRoute, "MAX_STREAM_POLLS", "System job stream polling", "job streams stay open long enough for queued creative renders to complete");
  assertIncludes(systemJobStreamRoute, "renderState: classifyCreativeRenderJob(job)", "System job stream payload", "job streams emit render state expected by UI consumers");
  assertIncludes(systemJobStreamRoute, "Creative rendering is still taking longer", "Generic creative stream timeout", "video and image job streams use generic customer-safe rendering copy");
  assertIncludes("src/lib/services/creative-builder-service.ts", "isLaunchReadyStaticImageAsset", "Launch media static visual gate", "launch-ready media excludes old generated static assets with baked-text risk");
  assertExcludes(launchRuntimeApi, "/api/integrations/meta/deploy", "No dead Meta deploy client route", "client helpers do not call a missing Meta deploy endpoint");
  assertIncludes(avatarProvider, "ALLOW_HIGGSFIELD_VIDEO_GENERATION !== \"true\"", "Higgsfield video generation kill switch", "queued video jobs cannot call Higgsfield unless explicitly enabled");
  assertIncludes(avatarProvider, "HiggsfieldVideoProvider", "Higgsfield video provider", "AI UGC/video generation has a Higgsfield provider implementation");
  assertIncludes(legacyAiProviders, "ALLOW_HIGGSFIELD_VIDEO_GENERATION", "Legacy helper Higgsfield guard", "older AI helper paths respect the Higgsfield video generation gate");
  assertIncludes(videoGenerationErrors, "Video preview is temporarily unavailable. Your campaign can continue with static creatives while we resolve video rendering.", "Video error safe fallback", "arbitrary upstream video-provider error text is not returned as customer/API copy");
  assertExcludes(videoGenerationErrors, "Review the operator diagnostics", "Video operator diagnostics hidden", "operator diagnostics are not exposed in customer-facing video errors");
  assertExcludes(videoGenerationErrors, "`The AI video provider could not start the video job. ${message}`", "Video raw error fallback removed", "video generation errors do not interpolate raw upstream provider messages into customer/API copy");
  assertIncludes(directHeyGenClient, "buildSafeHeyGenDiagnostic", "HeyGen safe diagnostic shape", "legacy HeyGen status persistence stores sanitized diagnostics instead of raw provider responses");
  assertExcludes(directHeyGenClient, "raw: data", "HeyGen raw payload persistence avoided", "legacy HeyGen helper does not persist full provider response payloads");
  assertIncludes(directHeyGenClient, "ALLOW_HEYGEN_VIDEO_GENERATION", "Legacy HeyGen direct client kill switch", "retained legacy HeyGen helper remains disabled unless explicitly enabled");
  assertIncludes(systemJobService, "claim_next_system_job", "Atomic system job claim", "system job worker uses DB-backed SKIP LOCKED claim RPC");
  assertIncludes(systemJobService, "system_job_not_claimed", "Claim required before job processing", "direct job processing fails unless an active worker lease exists");
  assertIncludes(systemJobService, "claimSystemJobByIdForWorker", "Marketing Studio worker claim", "dedicated worker jobs are claimed before finished-ad processing");
  assertIncludes("src/app/api/internal/system-jobs/route.ts", "min(6 * 60_000)", "Internal runner stale floor", "generic runners cannot request a stale reset shorter than the active lease plus buffer");
  assertIncludes(systemJobService, '.lt("started_at", staleBefore)', "Long-running job stale guard", "provider polling jobs are not reset only because their short lease expired");
  assertIncludes(systemJobService, "locked_until.lt", "Active lease stale reset guard", "valid future worker leases are not reset by generic runners");
  assertIncludes(systemJobService, "replayFailedPublicLeadCapture", "Lead retry job processor", "lead capture retry jobs replay or fail instead of silently completing");
  assertIncludes(systemJobService, "sideEffectJobId", "Lead retry side-effect recovery", "lead capture retries enqueue missed notification and CAPI side effects idempotently");
  assertIncludes(systemJobService, "dead_lettered_at: null", "Manual retry clears dead-letter", "operator retry can make dead-lettered jobs claimable again");
  assertIncludes(systemJobService, "dead_letter_reason", "System job dead-letter state", "failed jobs preserve dead-letter reason");
  assertIncludes(systemJobService, "last_error_code", "System job error classification", "operator views can filter repeated job error classes");
  assertIncludes(systemJobService, "maxAttempts", "System job max attempts", "jobs persist an attempt ceiling for DB claim/dead-letter enforcement");
  assertIncludes(internalLaunchMonitor, "provider_usage_events", "Provider issue visibility", "operator issues include failed/stale provider usage events");
  assertIncludes(internalLaunchMonitor, "provider_usage_limits", "Provider quota visibility", "operator issues include provider quota pressure");
  assertIncludes(internalLaunchMonitor, "user_credits", "Generation credit visibility", "operator issues include low generation-credit balances");
  assertIncludes(internalLaunchMonitor, '"provider_cost"', "Provider cost issue source", "provider quota, cost, and credit warnings have a durable operator source");

  assertIncludes(dashboardPage, "Last updated", "Dashboard last-updated state", "dashboard shows last updated timestamp");
  assertIncludes(dashboardPage, "leadLoopVerified", "Dashboard lead-loop state", "dashboard loads lead loop verification");

  assertIncludes("scripts/meta-launch-idempotency-test.md", "Interrupt after campaign creation", "Meta idempotency test doc", "forced interruption test documentation exists");
  assertIncludes("scripts/smoke-test-checklist.md", "Confirm `/preview` and `/launch` show the same selected ad.", "Manual smoke checklist", "manual staging smoke checklist exists");
  assertIncludes(productionRunbook, "Signup Abuse Controls", "Signup abuse runbook", "owner-only Supabase Auth hardening steps are documented");
  assertIncludes(productionRunbook, "Vercel Firewall / WAF Baseline", "Vercel WAF runbook", "edge bot/rate-limit rollout is documented");
  assertIncludes(selfServeScaleAudit, "100-client readiness", "Self-serve scale audit 100", "scale audit covers 100-client readiness");
  assertIncludes(selfServeScaleAudit, "200-client readiness", "Self-serve scale audit 200", "scale audit covers 200-client readiness");
  assertIncludes(selfServeScaleAudit, "500-client readiness", "Self-serve scale audit 500", "scale audit covers 500-client readiness");
  assertIncludes(selfServeScaleAudit, "1,000-client readiness", "Self-serve scale audit 1000", "scale audit covers 1,000-client readiness");
  assertIncludes(selfServeScaleAudit, "Higgsfield spend caps", "Self-serve scale audit provider caps", "scale audit covers provider spend caps");
  assertIncludes(selfServeScaleAudit, "RLS/auth", "Self-serve scale audit security", "scale audit covers tenant security and auth risk");
  assertIncludes(creativeGenerationDocs, "instant composed preview", "Creative generation UX contract doc", "creative generation docs require complete previews without waiting for generated imagery");
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

  const testSlug = getEnv("SMOKE_TEST_FUNNEL_SLUG") ?? "raiaan-broker-toronto-on-ccbfbfce";
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
  const allowSafeValidLeadProof = getEnv("SMOKE_ALLOW_SAFE_VALID_LEAD_PROOF") === "true";

  if (allowSafeValidLeadProof && testCampaignId && (testEmail || testPhone)) {
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
    info(
      allowSafeValidLeadProof
        ? "Valid lead submission skipped: set SMOKE_TEST_CAMPAIGN_ID plus SMOKE_TEST_EMAIL or SMOKE_TEST_PHONE to run the explicit safe proof."
        : "Valid lead submission skipped by default. Standard production smoke never creates a real lead; set SMOKE_ALLOW_SAFE_VALID_LEAD_PROOF=true only with a safe suppressed test campaign.",
    );
  }

  info(
    "Authenticated browser checks are outside standard unauthenticated smoke; run the safe E2E/browser proof for onboarding, selected creative persistence, dashboard state, and launch gates.",
  );
}

if (mode === "offline") {
  runOfflineChecks();
} else if (mode === "staging") {
  await runStagingChecks();
} else {
  fail("Smoke test mode", `Unsupported mode: ${mode}`);
}
