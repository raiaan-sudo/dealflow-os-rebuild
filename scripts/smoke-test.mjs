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
  const paywallPage = "src/app/(app)/paywall/page.tsx";
  const onboardingPage = "src/app/(app)/onboarding/page.tsx";
  const buildFunnelPage = "src/app/(app)/build/funnel/page.tsx";
  const buildCreativesPage = "src/app/(app)/build/creatives/page.tsx";
  const creativeWizard = "src/app/(app)/build/creatives/creative-wizard.tsx";
  const prepaywallPreview = "src/components/onboarding/prepaywall-campaign-preview.tsx";
  const onboardingRoute = "src/app/api/onboarding/plan/route.ts";
  const leadRoute = "src/app/api/lead-capture/route.ts";
  const leadForm = "src/app/f/[slug]/lead-capture-form.tsx";
  const dashboardPage = "src/app/(app)/dashboard/page.tsx";
  const dashboardView = "src/components/dashboard/campaign-dashboard-view.tsx";
  const dashboardPrimitives = "src/components/dashboard/dashboard-primitives.tsx";
  const builderPage = "src/app/(app)/builder/page.tsx";
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
  const billingService = "src/lib/services/billing-service.ts";
  const billingPlans = "src/lib/billing/plans.ts";
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
  const campaignPersistence = "src/lib/services/campaign-persistence.ts";
  const campaignPlanPersistence = "src/lib/services/campaign-plan-persistence-service.ts";
  const directHeyGenClient = "src/lib/ai/heygen.ts";
  const avatarProvider = "src/lib/integrations/creative/avatar-provider.ts";
  const apiRouteHelpers = "src/lib/api/route.ts";
  const rateLimitHelpers = "src/lib/api/rate-limit.ts";
  const twilioWebhookRoute = "src/app/api/sms/twilio/route.ts";
  const smsService = "src/lib/services/sms-service.ts";
  const leadMessageIdempotencyMigration = "supabase/migrations/20260428162000_harden_lead_message_idempotency.sql";
  const envHelpers = "src/lib/env.ts";
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
  const feedbackWidget = "src/components/layout/feedback-widget.tsx";
  const staticCreativePreviewCard = "src/components/campaign/static-creative-preview-card.tsx";
  const campaignPublishPanel = "src/components/campaign/campaign-publish-panel.tsx";
  const launchMetaSelectionPanel = "src/components/campaign/launch/launch-meta-selection-panel.tsx";
  const feedbackRoute = "src/app/api/feedback/route.ts";
  const safeE2eConfig = "playwright.safe.config.ts";
  const safeE2eSpec = "tests/e2e/safe-self-serve.spec.ts";
  const publishRoute = "src/app/api/campaigns/[id]/publish/route.ts";
  const optimizeRoute = "src/app/api/campaigns/[id]/optimize/route.ts";
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
  assertIncludes(onboardingRoute, "onboarding_idempotency_key", "Onboarding idempotency persistence", "campaign plans store onboarding idempotency key");
  assertIncludes(onboardingPage, "dealflow-guided-onboarding-v3", "Onboarding local draft persistence", "safe builder persists draft state locally without stale v2 step order");
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
  assertIncludes(unlockPage, "redirect(buildHref)", "Checkout cancel build return", "cancelled checkout goes back to the Build workspace instead of an internal unlock status page");
  assertIncludes(paywallPage, "Back to build", "Paywall back path", "activation back controls return to the Build workspace when a campaign exists");
  assertIncludes(previewPage, "redirect(\"/builder\")", "Preview missing state redirect", "review never becomes a second setup or missing-data workflow");
  assertIncludes(previewPage, "Back to build", "Preview back path", "review back controls return to the Build workspace");
  assertIncludes(builderPage, "Choose creatives", "Builder post-activation next step", "active campaign workspace sends unselected campaigns to creative selection before review");
  assertExcludes(buildFunnelPage, "ArtifactRecoveryPanel", "Funnel technical recovery hidden", "agents do not see technical artifact recovery under Build");
  assertExcludes(buildCreativesPage, "ArtifactRecoveryPanel", "Creative technical recovery hidden", "agents do not see technical artifact recovery under Build");
  assertExcludes(buildCreativesPage, "Creative artifacts are missing", "Creative missing copy hidden", "missing creative artifacts no longer show as an app page");
  assertIncludes(buildCreativesPage, "max-w-[1500px]", "Creative build workspace width", "creative selection uses more of the desktop viewport");
  assertIncludes(creativeWizard, "Primary creative", "Creative wizard primary focus", "creative selection leads with one primary creative instead of repeated stacks");
  assertIncludes(creativeWizard, "Change selected creatives", "Creative queue collapsed", "the full creative queue is secondary by default");
  assertIncludes(creativeWizard, "Back to build", "Creative wizard build return", "creative selection returns to the Build workspace instead of another setup flow");
  assertIncludes("src/lib/services/funnel-engine.ts", "cleanMarketingCopy", "Funnel copy sanitizer", "funnel copy removes awkward repeated market and spacing artifacts");
  assertIncludes("src/lib/services/funnel-engine.ts", "trimWords(cleanMarketingCopy(headline), 14)", "Funnel headline length guard", "funnel headlines are capped instead of over-concatenating onboarding fields");
  assertIncludes("src/lib/services/funnel-engine.ts", "conciseOfferPhrase", "Funnel offer shaping", "offer and lead magnet shape funnel copy without being dumped raw into the headline");
  assertIncludes("src/components/funnel/funnel-preview.tsx", "shouldUseOfferHero", "Funnel preview offer override", "existing saved funnels render an offer-led hero when stored copy is too generic");
  assertIncludes("src/components/funnel/funnel-preview.tsx", "section.type !== \"hero\"", "Funnel preview duplicate hero guard", "review preview does not repeat a stale hero section below the offer-led hero");
  assertIncludes(creativeEngine, "preventDuplicateStaticCreativeCopy", "Creative duplicate prevention", "static creative options deterministically vary duplicate headline/body/CTA combinations");
  assertIncludes(creativeEngine, "creativeAngleLabel", "Creative angle labels", "static creative copy receives distinct mode-specific marketing angles");
  assertIncludes(creativeEngine, "static-ugc-proof", "Static UGC concept slot", "creative test sets reserve a UGC-style proof concept inside the six static image renders");
  assertIncludes(creativeEngine, "static-ugc-walkthrough", "Static UGC walkthrough slot", "creative test sets reserve a UGC-style walkthrough/native social concept inside the six static image renders");
  assertIncludes(campaignVisualPromptBuilder, "finished, high-converting paid social creative frame", "Higgsfield prompt quality bar", "image prompts ask for polished ad-ready creative frames instead of generic real estate stock visuals");
  assertIncludes(campaignVisualPromptBuilder, "UGC-style ad frame", "UGC image prompt guidance", "UGC-style image concepts get creator POV and native social direction");
  assertIncludes("src/components/campaign/static-ad-composed-preview.tsx", "Showing the generated creative directly", "Generated creative visibility", "rendered Higgsfield images are shown cleanly instead of being covered by the fallback template overlay");
  assertIncludes("src/components/campaign/static-creative-preview-card.tsx", "line-clamp-3", "Creative card copy clamp", "creative cards show usable previews instead of full dense body copy");
  assertIncludes("src/components/campaign/static-creative-preview-card.tsx", "formatLabel", "UGC concept badge", "UGC-style concepts are visibly labeled in the creative selector");
  assertIncludes(staticCreativePreviewCard, "StaticCreativeSummaryCard", "Compact creative summary card", "selected creative lists use dense summary cards instead of tall repeated full previews");
  assertIncludes(previewPage, "Primary creative", "Preview primary creative summary", "preview page leads with one creative summary instead of repeated visual cards");
  assertIncludes(previewPage, "View creative details", "Preview collapsed creative details", "preview page keeps secondary creative details collapsed by default");
  assertIncludes(previewPage, "h-[520px] overflow-hidden", "Preview funnel height cap", "preview page caps the funnel preview instead of adding an embedded scroll area");
  assertIncludes(launchPage, "StaticCreativeSummaryCard", "Launch compact creative set", "launch page uses compact selected creative summaries");
  assertIncludes(builderPage, "Active campaign workspace", "Builder active campaign shell", "builder defaults to the active campaign workspace when a campaign exists");
  assertIncludes(builderPage, "activeCampaignCopy", "Builder active campaign count copy", "builder uses the real campaign count in active-campaign guidance");
  assertIncludes(builderPage, "mode=edit", "Builder edit gate", "full campaign editing is explicit instead of the default existing-campaign view");
  assertIncludes(builderPage, "new=1", "Builder secondary new campaign action", "launching another campaign is secondary and explicit");
  assertIncludes(billingPlans, "includedActiveCampaigns: 1", "Starter campaign limit", "Starter defaults to one active guided campaign");
  assertIncludes(billingPlans, "includedActiveCampaigns: 3", "Pro campaign limit", "Pro exposes additional active campaign slots");
  assertIncludes(dashboardPage, "loadDashboardStateForCampaign", "Dashboard real route", "dashboard loads real campaign state instead of the old plan comparison demo");
  assertIncludes(dashboardPage, "CampaignDashboardView", "Dashboard guided results shell", "dashboard renders the compact guided results view");
  assertExcludes(dashboardPage, "PlanAwareResultsPreview", "Dashboard demo route removed", "dashboard no longer serves the old layout behavior comparison variant");
  assertIncludes(dashboardPrimitives, "MetricTile", "Dashboard metric tile component", "dashboard visual primitives include reusable metric tiles");
  assertIncludes(dashboardPrimitives, "DashboardChartPanel", "Dashboard chart panel component", "dashboard visual primitives include chart panels");
  assertIncludes(dashboardPrimitives, "TrendAreaChart", "Dashboard trend chart component", "dashboard visual primitives include a lightweight SVG trend chart");
  assertIncludes(dashboardPrimitives, "MiniBarChart", "Dashboard bar chart component", "dashboard visual primitives include a lightweight bar chart");
  assertIncludes(dashboardView, "DashboardVisualMarker", "Dashboard visual component marker", "dashboard renders visual component markers for smoke coverage");
  assertOccurrenceCount(dashboardView, "Waiting for first delivery data", 1, "Dashboard waiting copy appears once", "dashboard shows the no-data state once instead of repeating it");
  assertIncludes(dashboardView, "Day 0", "Dashboard day-zero baseline", "empty dashboard charts use a Day 0 launch baseline");
  assertIncludes(dashboardView, "Live data", "Dashboard live data label", "dashboard distinguishes live synced values when data exists");
  assertIncludes(dashboardView, "Raw details and activity", "Dashboard raw details disclosure", "raw details remain collapsed under a disclosure");
  assertIncludes(dashboardView, "sanitizeCustomerActionText", "Dashboard customer action sanitizer", "dashboard normalizes internal optimizer action language before display");
  assertExcludes(dashboardView, "optimizerResult.status}", "Dashboard optimizer status hidden", "raw optimizer status is not rendered directly as next-action copy");
  assertExcludes(dashboardView, "Estimated recommendation", "Dashboard fake live label removed", "dashboard no longer labels empty recommendations as estimated live analytics");
  assertIncludes(resultsPage, "/dashboard", "Results canonical redirect", "legacy /results routes redirect into the real dashboard path");
  assertExcludes(resultsPage, "plan=starter", "Results plan demo redirect removed", "legacy results route no longer opens the plan comparison demo");
  assertIncludes(appLayout, "getStageForPath", "App shell route stage", "sidebar stage label follows the current route instead of hard-coding Build");
  assertIncludes(appLayout, "ACTIVE_CAMPAIGN_COOKIE", "App shell active campaign source", "workspace shell reads the active campaign cookie for scoped navigation");
  assertIncludes(appSidebar, "buildCampaignScopedHref", "Sidebar campaign-scoped navigation", "desktop product navigation preserves the active campaign id");
  assertIncludes(topBar, "buildCampaignScopedHref", "Mobile campaign-scoped navigation", "mobile product navigation and settings preserve the active campaign id");
  assertIncludes(paywallAccess, "const resolvedRecord = storedRecord ?? latestRecord", "Active campaign preference", "campaign resolution keeps the stored active campaign before falling back to latest");
  assertIncludes(appLayout, "pb-20", "Workspace feedback safe space", "workspace content reserves bottom room for the feedback widget");
  assertIncludes(feedbackWidget, "aria-modal=\"true\"", "Feedback dialog accessibility", "feedback modal is marked as a dialog");
  assertIncludes(feedbackWidget, "max-h-[calc(100dvh-2rem)]", "Feedback modal mobile fit", "feedback modal can scroll within short viewports");
  assertIncludes(launchMetaSelectionPanel, "encodeURIComponent(launchReturnTo)", "Meta reconnect campaign return", "Meta reconnect preserves campaign-scoped launch return path");
  assertIncludes(settingsPage, "Generation credits", "Settings credit management", "settings surfaces credit balance and top-up controls");
  assertIncludes(settingsPage, "Update payment method", "Settings payment management", "settings links Stripe Portal payment method management");
  assertIncludes(onboardingRoute, "commercial", "Onboarding commercial backend defaults", "commercial real estate onboarding mode is handled server-side");
  assertIncludes(onboardingRoute, "investor", "Onboarding investor backend defaults", "investor real estate onboarding mode is handled server-side");
  assertIncludes(appContextService, "isDemoWorkspaceSeedingEnabled", "Production demo seeding guard", "workspace demo data seeding is environment-gated");
  assertIncludes(appContextService, "fallbackOrganizationSlug", "Workspace slug collision guard", "bootstrap creates a user-owned fallback slug instead of recovering another owner workspace");
  assertIncludes(appContextService, "non-owned organization", "Workspace ownership bootstrap guard", "membership bootstrap refuses non-owned organizations");
  assertIncludes(membershipPolicyMigration, "drop policy if exists organization_memberships_insert_self", "Membership self-join policy removed", "authenticated users cannot self-join arbitrary organizations");

  assertIncludes(previewPage, "loadPersistedSelectedAdIds", "Preview selected creative source", "preview loads persisted selected creative set from DB helper");
  assertIncludes(previewPage, "getSelectedAdIdsFromPlan", "Preview selected creative plan helper", "preview resolves selected creative set through typed plan helper");
  assertIncludes(launchPage, "loadPersistedSelectedAdIds", "Launch selected creative source", "launch loads persisted selected creative set from DB helper");
  assertIncludes(launchPage, "getSelectedAdIdsFromPlan", "Launch selected creative plan helper", "launch resolves selected creative set through typed plan helper");
  assertExcludes(launchPage, "recommended", "Launch recommended fallback removed", "launch preview does not use recommended fallback");
  assertIncludes(launchPage, "statusLabel: budgetWasCapped ? \"Capped\" : budgetCapApplied ? undefined : \"Unlimited\"", "Launch budget policy visibility", "launch readiness shows unlimited budget policy when no cap is configured");
  assertIncludes(launchPage, "label: \"Meta preflight\"", "Launch Meta preflight visibility", "saved Meta selections and provider preflight are separate readiness gates");
  assertIncludes(launchPage, "Save the Meta ad account, Page, and pixel before launch.", "Launch selection blocker copy", "launch does not tell users to reconnect Meta after selections are already saved");
  assertIncludes("src/lib/integrations/meta/service.ts", "ready = accountValid && pageValid && pixelValid", "Meta preflight hard gate", "launch preflight is blocked by account, Page, or pixel validity, not missing tracking-domain setup");
  assertExcludes("src/lib/integrations/meta/service.ts", "Configure a launch domain before Meta launch.", "Meta launch domain not hard-blocking", "missing tracking domain no longer blocks the core launch preflight");
  assertIncludes(launchPage, "Reconnect Meta", "Launch Meta error reconnect CTA", "Meta OAuth failure banners provide a direct reconnect action");
  assertIncludes(launchPage, "Clear message", "Launch Meta error clear CTA", "stale Meta OAuth failure URLs can be cleared without leaving launch");
  assertIncludes(launchPage, "metaReconnectHref", "Launch Meta reconnect target", "Meta reconnect preserves the campaign-scoped launch return path from the error banner");
  assertIncludes(launchPage, "Why launch is blocked", "Launch blocker explanation", "launch page explains exactly why the launch button is disabled");
  assertIncludes(launchPage, "CampaignPublishPanel", "Launch funnel publish action", "launch page exposes the public funnel publish action when publishing is blocking launch");
  assertIncludes(campaignPublishPanel, "router.refresh()", "Publish panel launch gate refresh", "successful publish actions refresh server-rendered launch gates");
  assertIncludes(campaignPublishPanel, "livePublished", "Publish panel live snapshot truth", "the publish panel only marks a funnel public when a published snapshot exists");
  assertIncludes(campaignPublishPanel, "visibleError", "Publish panel stale error guard", "stale publish errors do not remain visible after a successful live publish");
  assertIncludes(campaignEntitlements, "getCurrentBillingOverrideForOrganization", "Campaign publish billing override", "campaign-scoped entitlements honor the current billing override for owner launch walkthroughs");
  assertIncludes(campaignEntitlements, "launchOverride", "Campaign entitlement override propagation", "publish and launch entitlement checks receive billing override state");
  assertIncludes(launchMetaSelectionPanel, "Meta selections saved. DealFlow is checking the launch gates now.", "Meta selection save confirmation", "saving Meta assets gives immediate confirmation");
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
  assertIncludes(launchRoute, "testModeInterruptAfter", "Forced interruption support", "forced interruption mode exists");
  assertIncludes(launchRoute, "ALLOW_META_LAUNCH_INTERRUPTION_TESTS", "Legacy launch interruption guard", "legacy campaign create launch path uses the same env gate as the launch route");
  assertIncludes(launchRoute, "handleApiError(error, \"Campaign create launch\")", "Legacy launch safe errors", "legacy campaign create launch path wraps parsing and CSRF failures in safe API errors");
  assertIncludes(launchApiRoute, "test_mode_interrupt_after", "Forced interruption launch API", "launch route forwards interruption mode");
  assertIncludes(launchApiRoute, "assertMetaLaunchBillingAccess", "Launch billing gate", "launch route enforces subscription/admin override gate");
  assertIncludes(launchApiRoute, "acquireMetaLaunchLock", "Durable Meta launch lock", "launch route uses DB-backed launch locking");
  assertIncludes(launchApiRoute, "ALLOW_META_LAUNCH_INTERRUPTION_TESTS", "Interruption guard", "forced interruption is env-gated");
  assertIncludes(metaExecution, "return \"PAUSED\"", "Meta objects remain paused", "shared Meta execution mapper never emits ACTIVE during beta");
  assertIncludes(metaExecution, "ALLOW_META_LIVE_LAUNCH", "Meta live launch kill switch", "live execution mode requires an explicit owner-controlled env flag");
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
  assertIncludes(leadRoute, "ALLOW_PUBLIC_LEAD_NO_TURNSTILE", "Lead capture Turnstile production guard", "production lead capture fails closed if Turnstile is not configured unless break-glass is set");
  assertIncludes(leadRoute, "https://challenges.cloudflare.com/turnstile/v0/siteverify", "Lead capture Turnstile siteverify", "public lead capture verifies Turnstile tokens server-side");
  assertIncludes(leadForm, "NEXT_PUBLIC_TURNSTILE_SITE_KEY", "Lead form Turnstile client gate", "public lead form renders Turnstile only when the public site key is configured");
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
  assertIncludes(systemJobService, "SUBSCRIPTION_GATED_JOB_KINDS", "Inactive workspace job gate", "provider and optimization jobs are skipped when billing is suspended");
  assertIncludes(systemJobService, "runSubscriptionSuspensionJob", "Suspension worker processor", "system job worker can process subscription suspension jobs");
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
  assertIncludes(feedbackWidget, "creative_quality", "Feedback creative quality category", "customer feedback can be categorized for support routing");
  assertIncludes(feedbackWidget, "cancellation_refund", "Feedback cancellation/refund category", "refund/cancel feedback is routed separately");
  assertIncludes(feedbackRoute, "category: body.category", "Feedback category event logging", "feedback logs the category without raw feedback text");
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
  assertIncludes(safeE2eSpec, "No live provider action runs here.", "Safe E2E provider boundary assertion", "browser proof asserts onboarding warns that no live provider action runs");
  assertIncludes("scripts/smoke-test-system.md", "npm run test:e2e:safe", "Safe browser E2E docs", "smoke documentation includes the safe browser proof command");
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
  assertIncludes(billingPlans, "priceLabel: \"$147/mo\"", "Starter price updated", "Starter self-serve plan is priced at $147/month");
  assertIncludes(billingPlans, "meta_launch: \"starter\"", "Starter Meta launch access", "Starter plan grants Meta launch access while Pro remains autonomy tier");
  assertIncludes(billingPlans, "autonomy_access: \"pro\"", "Pro autonomy access", "autonomous operator access remains Pro-gated");
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
  assertIncludes(billingService, "requestedCampaignId ?? \"workspace\"", "Stripe checkout idempotency campaign scope", "subscription checkout idempotency keys are scoped by campaign id");
  assertIncludes(billingService, "checkout_session_stale", "Stripe stale checkout reconciliation guard", "older parallel checkout sessions cannot unlock access");
  assertIncludes(envHelpers, "ALLOW_BILLING_ADMIN_OVERRIDE", "Billing admin override env gate", "internal launch override requires explicit env opt-in");
  assertIncludes(envHelpers, "BILLING_ADMIN_OVERRIDE_EMAILS", "Billing-only override allowlist", "billing override can be scoped without granting operator admin access");
  assertIncludes(creditService, "GENERATION_CREDIT_OVERDRAFT_LIMIT_CENTS", "Credit overdraft cap env", "self-serve paid generation overdraft is capped instead of unlimited");
  assertIncludes("supabase/migrations/20260510183000_cap_generation_credit_overdrafts.sql", "next_balance < -overdraft_limit", "DB credit overdraft cap", "database credit consumption enforces a maximum negative balance");
  assertIncludes(".env.example", "INTERNAL_SYSTEM_JOBS_SECRET", "Internal runner env example", "cron runner secret is documented in the environment template");
  assertIncludes(".env.example", "CRON_SECRET", "Vercel cron env example", "Vercel Cron secret fallback is documented in the environment template");
  assertIncludes(billingService, "isBillingAdminOverrideEmail(email) ? email : null", "Billing-only override check", "billing override requires the billing-specific email allowlist");
  assertExcludes(billingService, "isInternalAdminEmail(email)", "Billing override admin fallback removed", "internal admin access no longer automatically grants billing launch access");
  assertIncludes(campaignEntitlements, "return isBillingAdminOverrideEmail(email)", "Campaign entitlement billing override", "campaign launch entitlements use the billing-specific override allowlist");
  assertIncludes(billingService, "billing_admin_override_launch_access_granted", "Billing admin override audit log", "override-based launch access grants are audit logged");
  assertIncludes(billingService, "billing_checkout_bypass", "Billing override checkout bypass", "override users do not create live Stripe checkout sessions");
  assertIncludes(paywallPage, "launchOverride={billing?.launchOverride === true}", "Paywall override handoff", "billing override state is passed into the paywall CTA");
  assertIncludes("src/components/billing/paywall-plan-selector.tsx", "Activate {selectedPlan.name}", "Paywall simulated activation CTA", "billing override users see normal activation copy without opening Stripe checkout");
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
  assertIncludes(creditService, "grant_user_credits", "Credit top-up ledger", "credit grants and refunds use the append-only DB ledger");
  assertIncludes(creditService, "CREDIT_TOP_UP_MINIMUM_CENTS = 2_000", "Credit top-up minimum", "generation credit top-ups require the intended $20 minimum");
  assertIncludes(creditService, "bypassedByBillingOverride", "Credit billing override", "billing override users can test paid generation without internal credit balance friction");
  assertIncludes("supabase/migrations/20260510014500_enable_generation_credit_overdrafts.sql", "next_balance := current_balance - p_amount", "Credit overdraft ledger", "paid generation can create a negative balance that is repaid by the next top-up");
  assertIncludes(billingService, "checkout_kind: \"credit_top_up\"", "Stripe credit top-up checkout", "credit purchases are isolated from subscription checkout metadata");
  assertIncludes(billingService, "stripe_credit_top_up_processed", "Stripe credit top-up webhook", "paid credit checkout sessions grant credits idempotently");
  assertIncludes(billingService, "payment_method_types: [\"card\"]", "Stripe credit top-up synchronous payment", "credit top-up checkout is card-only so delayed async payment methods do not strand credits");
  assertIncludes(creativeEngine, "provider_usage_context", "Paid static generation guard", "each generated image carries DB-backed provider usage context");
  assertIncludes(campaignPersistence, "consumeSessionCostBudget", "Paid image call guard", "server-side static generation reserves provider budget before execution");
  assertIncludes(staticAdsRoute, "idempotencyKey", "Static generation idempotency", "paid generation job creation uses idempotency key");
  assertIncludes(envHelpers, "getHiggsfieldEnv", "Higgsfield env helper", "Higgsfield provider credentials and model settings are centralized");
  assertIncludes(envHelpers, "MEDIA_GENERATION_PROVIDER", "Media provider selector", "media generation can select Higgsfield without touching UI flows");
  assertIncludes(imageProvider, "ALLOW_HIGGSFIELD_IMAGE_GENERATION !== \"true\"", "Higgsfield image generation kill switch", "paid image provider returns unsupported unless explicitly enabled");
  assertIncludes(imageProvider, "HiggsfieldImageProvider", "Higgsfield image provider", "static image generation has a Higgsfield provider implementation");
  assertIncludes(higgsfieldClient, "@higgsfield/client/v2", "Official Higgsfield SDK", "Higgsfield integration uses the server-side SDK instead of MCP or CLI");
  assertIncludes(higgsfieldClient, "resolveImageEndpoint", "Higgsfield endpoint mapping", "Higgsfield Cloud model aliases are mapped to supported API endpoints instead of being posted as URL paths");
  assertIncludes(higgsfieldClient, "\"/v1/text2image/soul\"", "Higgsfield Cloud image endpoint", "Marketing Studio image aliases use the supported Cloud text-to-image endpoint");
  assertIncludes(higgsfieldClient, "buildImageInput", "Higgsfield model parameter mapping", "Higgsfield Cloud requests use the selected model's accepted input shape instead of a one-size-fits-all payload");
  assertIncludes(higgsfieldClient, "width_and_height", "Higgsfield image payload", "Higgsfield Cloud image renders send supported Soul text-to-image dimensions");
  assertIncludes(higgsfieldClient, "withPolling: true", "Higgsfield image polling", "image generation waits for a completed result before surfacing a file URL");
  assertIncludes(higgsfieldClient, "withPolling: false", "Higgsfield async video start", "video generation stays async and does not block the request path");
  assertIncludes(launchRoute, "assertMetaLiveLaunchEnabled", "Reachable Meta live launch kill switch", "direct Meta launch route fails closed unless ALLOW_META_LIVE_LAUNCH=true");
  assertIncludes("src/lib/integrations/meta/budget-cap.ts", "/^(0|none|off|unlimited)$/i", "Meta budget unlimited policy", "unset, zero, off, none, or unlimited budget cap config removes the DealFlow cap");
  assertIncludes(metaExecution, "meta_budget_cap_missing", "Live Meta budget cap required", "live Meta launch fails closed when a finite budget cap is missing");
  assertIncludes(metaLaunchService, "getMetaDailyBudgetCapCents()", "Reachable Meta budget policy", "direct Meta launch uses the shared owner-configured budget cap policy");
  assertIncludes(sessionCostGuard, "reserve_provider_usage", "Atomic provider usage reservation", "paid-generation guard reserves provider budget through DB RPC");
  assertIncludes(sessionCostGuard, "HIGGSFIELD_IMAGE_DAILY_LIMIT", "Configurable Higgsfield image cap", "Higgsfield image generation can be capped below the default for production tests");
  assertIncludes(sessionCostGuard, "image_generation", "Generic image generation bucket", "paid image reservations use a provider-neutral operation bucket");
  assertIncludes(creditService, "legacyBucket", "Legacy credit bucket compatibility", "old OpenAI/HeyGen credit metadata remains understandable after provider migration");
  assertIncludes(sessionCostGuard, "provider_usage_idempotency_consumed", "Paid generation duplicate-spend guard", "consumed provider usage reservations fail closed instead of calling the provider again");
  assertIncludes(sessionCostGuard, "consumeCreditsForGeneration", "Provider usage credit coupling", "provider reservations consume credits before paid calls execute");
  assertIncludes(sessionCostGuard, "refundCreditsForProviderUsageEvent", "Credit refund coupling", "released or failed paid calls refund reserved credits");
  assertIncludes(legacyAiProviders, "providerUsage?.mark", "Provider usage ledger transitions", "paid-generation reservations are marked consumed/released after the provider call");
  assertIncludes(legacyAiProviders, "providerJobWasCreated", "Provider usage pre-job release", "provider attempts that fail before a provider job id is returned release the daily reservation");
  assertIncludes(videoRoute, "kind: \"video_generation\"", "Video generation job route", "AI video generation is queued through the paid system job path");
  assertIncludes(videoRoute, "getCampaignById", "Video generation ownership guard", "video generation verifies campaign ownership before queueing paid work");
  assertIncludes(systemJobService, "video_generation_status", "Video generation status polling", "AI video render completion is polled by durable follow-up jobs instead of blocking the cron worker");
  assertIncludes(staticAdsRoute, "scheduleStaticCreativeJob", "Static generation kickoff", "creative preview jobs are kicked immediately instead of relying only on cron");
  assertIncludes(staticAdsRoute, "if (existingActiveJob)", "Static generation active-job reuse", "forced preview retries reuse active work instead of stacking duplicate paid jobs");
  assertIncludes(systemJobStreamRoute, "MAX_STREAM_POLLS", "System job stream polling", "job streams stay open long enough for queued creative renders to complete");
  assertIncludes(systemJobStreamRoute, "? { ...job, logs }", "System job stream payload", "job streams emit the job shape expected by UI consumers");
  assertExcludes(launchRuntimeApi, "/api/integrations/meta/deploy", "No dead Meta deploy client route", "client helpers do not call a missing Meta deploy endpoint");
  assertIncludes(avatarProvider, "ALLOW_HIGGSFIELD_VIDEO_GENERATION !== \"true\"", "Higgsfield video generation kill switch", "queued video jobs cannot call Higgsfield unless explicitly enabled");
  assertIncludes(avatarProvider, "HiggsfieldVideoProvider", "Higgsfield video provider", "AI UGC/video generation has a Higgsfield provider implementation");
  assertIncludes(legacyAiProviders, "ALLOW_HIGGSFIELD_VIDEO_GENERATION", "Legacy helper Higgsfield guard", "older AI helper paths respect the Higgsfield video generation gate");
  assertIncludes(directHeyGenClient, "ALLOW_HEYGEN_VIDEO_GENERATION", "Legacy HeyGen direct client kill switch", "retained legacy HeyGen helper remains disabled unless explicitly enabled");
  assertIncludes(systemJobService, "claim_next_system_job", "Atomic system job claim", "system job worker uses DB-backed SKIP LOCKED claim RPC");
  assertIncludes(systemJobService, "replayFailedPublicLeadCapture", "Lead retry job processor", "lead capture retry jobs replay or fail instead of silently completing");
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
