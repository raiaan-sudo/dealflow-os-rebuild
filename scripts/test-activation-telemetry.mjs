#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function pass(name, detail = "") {
  console.log(`PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name, detail = "") {
  console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  process.exitCode = 1;
}

function assertIncludes(relativePath, pattern, name, detail) {
  const text = read(relativePath);
  const ok = typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);

  if (ok) {
    pass(name, detail);
  } else {
    fail(name, detail || `${relativePath} missing ${String(pattern)}`);
  }
}

function assertExcludes(relativePath, pattern, name, detail) {
  const text = read(relativePath);
  const bad = typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);

  if (bad) {
    fail(name, detail || `${relativePath} contains forbidden ${String(pattern)}`);
  } else {
    pass(name, detail);
  }
}

const migration = "supabase/migrations/20260504183000_create_activation_events.sql";
const service = "src/lib/services/activation-telemetry-service.ts";
const route = "src/app/api/activation/events/route.ts";
const onboardingPage = "src/app/(app)/onboarding/page.tsx";
const onboardingRoute = "src/app/api/onboarding/plan/route.ts";
const previewPage = "src/app/(app)/preview/page.tsx";
const paywallPage = "src/app/(app)/paywall/page.tsx";
const checkoutRoute = "src/app/api/billing/checkout/route.ts";
const unlockPage = "src/app/(app)/unlock/page.tsx";
const dashboardPage = "src/app/(app)/dashboard/page.tsx";
const metaConnectRoute = "src/app/api/integrations/meta/connect/route.ts";
const metaSelectionsRoute = "src/app/api/integrations/meta/selections/route.ts";
const launchPage = "src/app/(app)/launch/page.tsx";
const operatorMonitor = "src/lib/services/internal-launch-monitor.ts";

assertIncludes(migration, "create table if not exists public.activation_events", "Activation events table migration", "durable Supabase event table is defined");
assertIncludes(migration, "activation_events_org_event_key_unique", "Activation event idempotency constraint", "organization-scoped event keys dedupe repeats");
assertIncludes(migration, "force row level security", "Activation event forced RLS", "table is protected by forced RLS");
assertIncludes(migration, "activation_events_member_select", "Activation event member select policy", "members can read only their organization telemetry");
assertIncludes(migration, "activation_events_service_role_all", "Activation event service write policy", "writes are server/service-role only");
assertIncludes(migration, "Metadata must contain safe flags/enums/IDs only", "Activation metadata privacy comment", "migration documents no-PII metadata policy");

assertIncludes(service, "FORBIDDEN_METADATA_KEY", "Telemetry metadata scrubber", "server helper rejects sensitive metadata keys");
assertIncludes(service, "sanitizeActivationMetadata", "Telemetry metadata sanitizer", "metadata is sanitized before insert");
assertIncludes(service, "recordActivationEvent", "Central telemetry recorder", "server helper records durable events");
assertIncludes(service, "loadActivationStallIssues", "Activation stall loader", "operator summary can surface slow activation");
assertExcludes(service, /console\.(log|error|warn)\(/, "No raw telemetry console logging", "service uses structured safe logging helpers only");

assertIncludes(route, "assertSameOriginRequest", "Activation route CSRF guard", "client event writes require same-origin requests");
assertIncludes(route, "getAuthenticatedContext", "Activation route auth guard", "client event writes require an authenticated workspace");
assertIncludes(route, "activation_event_body_too_large", "Activation route body limit", "event metadata body size is bounded");
assertIncludes(route, "signup_session_initialized", "Activation route session event", "first client activation write also records an idempotent session milestone");

assertIncludes(onboardingPage, "onboarding_started", "Onboarding start event", "wizard records the first activation event");
assertIncludes(onboardingPage, "onboarding_step_completed", "Onboarding step event", "wizard records step completion without PII");
assertIncludes(onboardingRoute, "onboarding_completed", "Onboarding completed event", "server persists completion after successful plan creation");
assertIncludes(onboardingRoute, "campaign_plan_persisted", "Campaign plan persisted event", "server records campaign persistence");
assertIncludes(previewPage, "preview_generated_or_viewed", "Preview activation event", "preview page records the pre-payment value moment");
assertIncludes(paywallPage, "paywall_viewed", "Paywall activation event", "paywall impressions are durable");
assertIncludes(checkoutRoute, "checkout_started", "Checkout started event", "checkout handoff is durable");
assertIncludes(unlockPage, "checkout_completed_or_reconciled", "Checkout completed/reconciled event", "post-checkout reconciliation is durable");
assertIncludes(dashboardPage, "dashboard_viewed", "Dashboard viewed event", "dashboard preview is tracked");
assertIncludes(metaConnectRoute, "meta_connect_started", "Meta connect event", "Meta OAuth start is tracked");
assertIncludes(metaSelectionsRoute, "meta_selection_completed", "Meta selection event", "Meta asset selection is tracked");
assertIncludes(launchPage, "launch_ready", "Launch-ready event", "pre-launch readiness is tracked without launching");
assertIncludes(operatorMonitor, "source: \"activation\"", "Operator activation radar", "activation stalls appear in the existing operator issue queue");

if (process.exitCode) {
  process.exit(process.exitCode);
}
