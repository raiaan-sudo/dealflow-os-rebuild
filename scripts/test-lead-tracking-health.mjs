#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260706170000_create_lead_tracking_health.sql", "utf8");
const trackingService = fs.readFileSync("src/lib/services/lead-tracking-service.ts", "utf8");
const leadRoute = fs.readFileSync("src/app/api/lead-capture/route.ts", "utf8");
const leadForm = fs.readFileSync("src/app/f/[slug]/lead-capture-form.tsx", "utf8");
const browserPixelRoute = fs.readFileSync("src/app/api/lead-tracking/browser-pixel/route.ts", "utf8");
const conversions = fs.readFileSync("src/lib/integrations/meta/conversions.ts", "utf8");
const launchRoute = fs.readFileSync("src/app/api/campaigns/[id]/launch/route.ts", "utf8");
const launchFencingMigration = fs.readFileSync(
  "supabase/migrations/20260710235500_schedule_launch_claim_fencing.sql",
  "utf8",
);
const metaService = fs.readFileSync("src/lib/integrations/meta/service.ts", "utf8");
const metaStatusSync = fs.readFileSync("src/lib/integrations/meta/status-sync.ts", "utf8");
const metaCampaignSync = fs.readFileSync("src/lib/services/meta-campaign-sync-service.ts", "utf8");
const fulfillmentMonitor = fs.readFileSync("src/lib/services/fulfillment-monitor-service.ts", "utf8");
const supabaseCookieOptions = fs.readFileSync("src/lib/supabase/cookie-options.ts", "utf8");
const supabaseBrowserClient = fs.readFileSync("src/lib/supabase/client.ts", "utf8");
const supabaseServerClient = fs.readFileSync("src/lib/supabase/server.ts", "utf8");
const qaAuthSessionRoute = fs.readFileSync("src/app/api/internal/qa-auth-session/route.ts", "utf8");
const proxy = fs.readFileSync("src/proxy.ts", "utf8");

function assertOrdered(source, patterns, message) {
  let cursor = -1;
  for (const pattern of patterns) {
    const index = source.indexOf(pattern, cursor + 1);
    assert.ok(index > cursor, message);
    cursor = index;
  }
}

assert.match(migration, /create table if not exists public\.campaign_tracking_contracts/, "tracking contract table must exist");
assert.match(migration, /create table if not exists public\.lead_tracking_events/, "lead tracking event table must exist");
assert.match(migration, /tracking_mode in \('website_funnel', 'instant_form'\)/, "tracking modes must distinguish website funnel and instant form");
assert.match(migration, /expected_lead_destination in \('dealflow_dashboard', 'facebook_lead_center'\)/, "lead destination contract must be explicit");
assert.match(migration, /public\.is_current_user_org_member\(organization_id\)/, "tracking tables must be member-readable through org RLS");
assert.match(migration, /revoke all on table public\.lead_tracking_events from anon, authenticated/, "tracking event writes must not be public");

assert.match(trackingService, /buildTrackingReadiness/, "tracking service must expose launch readiness checks");
assert.match(trackingService, /missing\.push\("pixel_id"\)/, "website funnel tracking readiness must require a pixel");
assert.match(trackingService, /missing\.push\("launch_domain"\)/, "website funnel tracking readiness must require a launch domain");
assert.match(trackingService, /missing\.push\("meta_access_token"\)/, "website funnel tracking readiness must require Meta token availability");
assert.match(trackingService, /upsertCampaignTrackingContract/, "tracking service must upsert campaign contracts");
assert.match(trackingService, /recordLeadTrackingEvent/, "tracking service must record per-lead tracking events");
assert.match(trackingService, /getCampaignTrackingHealth/, "tracking service must expose campaign health summary");

assert.match(leadRoute, /eventType: "lead_captured"/, "lead capture must write lead_captured tracking event");
assert.match(
  leadRoute,
  /const metaConversionQueued = sideEffectJob\.enabledEffects\.includes\("meta_conversion"\)/,
  "lead capture must derive CAPI queue truth from the persisted job policy",
);
assert.match(
  leadRoute,
  /eventType: metaConversionQueued \? "capi_queued" : "capi_failed"/,
  "lead capture must not claim CAPI was queued when consent removed the effect",
);
assert.match(leadRoute, /meta_capi_consent_missing/, "missing CAPI consent must retain a safe reason");
assert.match(leadRoute, /parseLandingPageAttribution/, "lead capture must backfill attribution from landing URL");
assert.match(leadRoute, /utm_content/, "lead capture must preserve Meta ad id attribution from utm_content");

assert.match(leadForm, /recordBrowserPixelAttempt/, "public funnel must report browser pixel attempts");
assert.match(leadForm, /navigator\.sendBeacon/, "browser pixel telemetry should survive thank-you navigation");
assert.match(leadForm, /eventID: leadId/, "browser pixel event ID must match the DealFlow lead id");
assert.match(browserPixelRoute, /assertSameOriginRequest/, "browser pixel telemetry must be same-origin guarded");
assert.match(browserPixelRoute, /consumeRateLimit/, "browser pixel telemetry must be rate limited");
assert.match(browserPixelRoute, /\.eq\("id", payload\.lead_id\)/, "browser pixel telemetry must validate lead id before writing");
assert.match(browserPixelRoute, /eventType: "browser_pixel_attempted"/, "browser pixel route must write browser_pixel_attempted event");

assert.match(conversions, /eventType: "capi_sent"/, "CAPI success must be tracked");
assert.match(conversions, /eventType: "capi_failed"/, "CAPI failures and skips must be tracked");
assert.match(conversions, /meta_connection_missing/, "CAPI missing connection skip must be visible");
assert.match(conversions, /meta_pixel_missing/, "CAPI missing pixel skip must be visible");
assert.match(conversions, /meta_access_token_missing/, "CAPI missing token skip must be visible");
assert.match(conversions, /meta_env_missing/, "CAPI missing env skip must be visible");

assert.match(launchRoute, /completeManualCampaignLaunchClaim/, "launch must settle through the atomic completion RPC");
assert.match(launchRoute, /getMetaWorkspaceCredentials/, "launch must fail closed when Meta pixel or token credentials are missing");
assertOrdered(
  launchRoute,
  [
    "const metaCredentials = await getMetaWorkspaceCredentials",
    "const response = await launchCampaignToMeta",
    "await completeManualCampaignLaunchClaim",
    "return {",
  ],
  "Meta credentials must be validated before launch and the atomic completion RPC must settle before the response returns",
);
const manualCompletionSource = launchFencingMigration.slice(
  launchFencingMigration.indexOf("create or replace function public.complete_manual_campaign_launch_claim"),
  launchFencingMigration.indexOf("create or replace function public.fail_manual_campaign_launch_claim"),
);
assertOrdered(
  manualCompletionSource,
  [
    "update public.campaign_launch_records candidate",
    "update public.campaign_plans campaign",
    "perform private.persist_launch_tracking_contract",
    "return true",
  ],
  "Manual completion must atomically persist receipt truth, campaign runtime, and tracking before success",
);
assert.match(
  launchFencingMigration,
  /insert into public\.lead_tracking_events/,
  "Atomic launch tracking settlement must append a tracking event",
);

assert.match(metaService, /pixel_id: nextPixelId/, "Meta selections must persist the selected pixel id");
assert.match(metaService, /selected_external_account_id: nextAccount\.externalAccountId/, "Meta selections must persist selected ad account alias");
assert.match(metaService, /pixel_id: nextPixelId \?\? null/, "derived tracking config persistence must preserve selected pixel metadata");

assert.match(metaStatusSync, /actions,conversions/, "Meta delivery sync must request raw actions and conversions");
assert.match(metaStatusSync, /raw_actions/, "Meta delivery metrics must preserve raw action rows");
assert.match(metaStatusSync, /raw_conversions/, "Meta delivery metrics must preserve raw conversion rows");
assert.match(metaCampaignSync, /eventType: "meta_reporting_checked"/, "Meta sync must write reporting reconciliation events");
assert.match(metaCampaignSync, /status: deliveryMetrics\.leads > 0 \? "seen" : "missing"/, "Meta sync must distinguish seen vs missing reported leads");

assert.match(fulfillmentMonitor, /RelatedTrackingSummary/, "fulfillment monitor must expose tracking summary");
assert.match(fulfillmentMonitor, /lead_tracking_events/, "fulfillment monitor must read lead tracking events");
assert.match(fulfillmentMonitor, /browserPixelAttempted/, "fulfillment monitor must show browser pixel attempts");
assert.match(fulfillmentMonitor, /metaReportingStatus/, "fulfillment monitor must show Meta reporting status");

assert.match(supabaseCookieOptions, /sameSite:\s*isProduction\s*\?\s*"none"\s*:\s*"lax"/, "Supabase auth cookies must use SameSite=None in production for GHL iframe sign-in");
assert.match(supabaseCookieOptions, /secure:\s*isProduction/, "Supabase auth cookies must be Secure when SameSite=None is used in production");
assert.match(supabaseBrowserClient, /cookieOptions:\s*getSupabaseAuthCookieOptions\(\)/, "browser Supabase client must use shared iframe-compatible auth cookie options");
assert.match(supabaseServerClient, /cookieOptions:\s*getSupabaseAuthCookieOptions\(\)/, "server Supabase client must use shared iframe-compatible auth cookie options");
assert.match(proxy, /cookieOptions:\s*getSupabaseAuthCookieOptions\(\)/, "proxy Supabase client must keep refreshed sessions iframe compatible");
assert.doesNotMatch(qaAuthSessionRoute, /SameSite=Lax;\s*Secure/, "QA auth harness must not hard-code Lax cookies that fail inside GHL iframe proof runs");

console.log("lead tracking health regression checks passed");
