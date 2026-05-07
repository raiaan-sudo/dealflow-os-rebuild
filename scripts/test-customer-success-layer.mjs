#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const migration = read("supabase/migrations/20260504210000_create_customer_success_checklists.sql");
const service = read("src/lib/services/customer-success-service.ts");
const commandCenterPage = read("src/app/(app)/admin/command-center/page.tsx");
const commandCenterConsole = read("src/app/(app)/admin/command-center/command-center-console.tsx");
const issueMonitor = read("src/lib/services/internal-launch-monitor.ts");
const feedbackWidget = read("src/components/layout/feedback-widget.tsx");
const feedbackRoute = read("src/app/api/feedback/route.ts");
const supportDocs = read("docs/customer-success-support-runbook.md");

assert.match(migration, /create table if not exists public\.customer_success_checklists/);
assert.match(migration, /onboarding_reviewed_at/);
assert.match(migration, /creative_qa_completed_at/);
assert.match(migration, /day_7_check_in_completed_at/);
assert.match(migration, /day_14_value_proof_completed_at/);
assert.match(migration, /day_25_renewal_risk_review_completed_at/);
assert.match(migration, /force row level security/);
assert.match(migration, /customer_success_checklists_member_select/);
assert.match(migration, /customer_success_checklists_service_role_all/);
assert.doesNotMatch(migration, /provider_token|access_token|card_number|phone|email/i);

for (const key of [
  "onboarding_review",
  "creative_qa",
  "preview_reviewed",
  "billing_active",
  "meta_connected",
  "assets_selected",
  "launch_readiness",
  "lead_loop_verified",
  "day_7_check_in",
  "day_14_value_proof",
  "day_25_renewal_risk_review",
]) {
  assert.match(service, new RegExp(key));
}

assert.match(service, /loadCustomerSuccessChecklistRows/);
assert.match(service, /loadCustomerSuccessIssues/);
assert.match(service, /evaluateCampaignEntitlements/);
assert.match(service, /activation_events/);
assert.match(service, /customer_success_checklists/);
assert.match(issueMonitor, /source: "customer_success"/);
assert.match(commandCenterPage, /loadCustomerSuccessChecklistRows/);
assert.match(commandCenterConsole, /Customer-success watchlist/);
assert.match(commandCenterConsole, /First 25-day checklist/);

for (const category of [
  "confusing_ux",
  "billing",
  "onboarding",
  "creative_quality",
  "meta_connect",
  "lead_funnel",
  "bug",
  "cancellation_refund",
]) {
  assert.match(feedbackWidget, new RegExp(category));
  assert.match(feedbackRoute, new RegExp(category));
}

assert.match(feedbackRoute, /category: body\.category/);
assert.match(feedbackRoute, /confusedTextPresent/);
assert.match(feedbackRoute, /blockerTextPresent/);
assert.doesNotMatch(feedbackRoute, /confusedText:\s*body\.confusedText|blockerText:\s*body\.blockerText/);

assert.match(supportDocs, /Support Categories/);
assert.match(supportDocs, /SLA Expectations/);
assert.match(supportDocs, /Canned Response Outlines/);
assert.match(supportDocs, /Escalation Rules/);
assert.match(supportDocs, /First 25-Day Customer-Success Checklist/);
assert.match(supportDocs, /Out Of Scope/);

console.log("Customer-success and support operating layer tests passed.");
