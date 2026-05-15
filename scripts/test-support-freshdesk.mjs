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
    fail(name, detail ?? `${relativePath} missing ${String(pattern)}`);
  }
}

function assertExcludes(relativePath, pattern, name, detail) {
  const text = read(relativePath);
  const bad = typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);

  if (bad) {
    fail(name, detail ?? `${relativePath} contains ${String(pattern)}`);
  } else {
    pass(name, detail);
  }
}

const supportTicket = "src/lib/support/support-ticket.ts";
const supportCategories = "src/lib/support/support-categories.ts";
const freshdesk = "src/lib/support/freshdesk.ts";
const route = "src/app/api/support/ticket/route.ts";
const widget = "src/components/layout/support-widget.tsx";
const layout = "src/app/(app)/layout.tsx";
const envExample = ".env.example";
const docs = "docs/customer-success-support-runbook.md";

const categories = [
  "contact_support",
  "report_bug",
  "billing_help",
  "campaign_not_working",
  "meta_connection_issue",
  "creative_generation_issue",
  "ai_ugc_video_issue",
  "launch_issue",
  "lead_delivery_issue",
  "login_account_issue",
  "other",
];

for (const category of categories) {
  assertIncludes(supportCategories, `"${category}"`, `Support category ${category}`, "shared category source includes the customer-facing category");
}
assertIncludes(widget, "SUPPORT_CATEGORY_OPTIONS.map", "Support widget category source", "client dropdown renders the shared customer-facing category list");

assertIncludes(supportTicket, "z.enum(SUPPORT_CATEGORIES)", "Support category validation", "invalid categories are rejected server-side");
assertIncludes(supportTicket, ".min(10).max(4000)", "Support message length validation", "message is required and bounded");
assertIncludes(supportCategories, "SUPPORT_PRIORITY_BY_CATEGORY", "Support priority mapping", "Freshdesk priority is deterministic");
assertIncludes(supportCategories, "launch_issue: 3", "Launch issue high priority", "launch blockers map to high priority");
assertIncludes(supportCategories, "meta_connection_issue: 3", "Meta issue high priority", "Meta connection issues map to high priority");
assertIncludes(supportCategories, "billing_help: 3", "Billing issue high priority", "billing help maps to high priority");
assertIncludes(supportCategories, "ai_ugc_video_issue: 2", "UGC issue medium priority", "creative quality issues stay medium priority");
assertIncludes(supportTicket, "subject:", "Freshdesk subject construction", "payload includes a subject");
assertIncludes(supportTicket, "[${categoryLabel}] Campaign ${campaignLabel} - ${requester}", "Freshdesk subject format", "subject includes category, campaign, and requester");
assertIncludes(supportTicket, "User email", "Freshdesk body user context", "description includes user context");
assertIncludes(supportTicket, "Organization ID", "Freshdesk body org context", "description includes organization context");
assertIncludes(supportTicket, "Campaign ID", "Freshdesk body campaign context", "description includes campaign context");
assertIncludes(supportTicket, "Plan tier", "Freshdesk body plan context", "description includes billing plan context");
assertIncludes(supportTicket, "Server deployment ID", "Freshdesk body deployment context", "description includes deployment context");
assertIncludes(supportTicket, "Browser/user agent", "Freshdesk body browser context", "description includes browser context");
assertIncludes(supportTicket, "Redaction note", "Freshdesk body redaction note", "description explains redaction");
assertIncludes(supportTicket, "Bearer", "Bearer token redaction", "redaction covers bearer tokens");
assertIncludes(supportTicket, "cookie|set-cookie", "Cookie redaction", "redaction covers cookies");
assertIncludes(supportTicket, "freshdesk_api_key", "Freshdesk key redaction", "redaction covers Freshdesk API keys");
assertIncludes(supportTicket, "stripe", "Stripe secret redaction", "redaction covers Stripe-like secrets");
assertIncludes(supportTicket, "supabase", "Supabase secret redaction", "redaction covers Supabase service role-like secrets");
assertIncludes(supportTicket, "signed url", "Signed URL redaction", "redaction covers signed URLs");
assertIncludes(supportTicket, "provider/media", "Provider media URL redaction", "redaction covers provider/media URLs");

assertIncludes(freshdesk, "server-only", "Freshdesk server-only boundary", "Freshdesk API code cannot be bundled into client components");
assertIncludes(freshdesk, "FRESHDESK_DOMAIN", "Freshdesk domain env", "service reads domain server-side");
assertIncludes(freshdesk, "FRESHDESK_API_KEY", "Freshdesk API key env", "service reads API key server-side");
assertIncludes(freshdesk, "Buffer.from(`${config.apiKey}:X`).toString(\"base64\")", "Freshdesk Basic auth", "API key is username and X is password");
assertIncludes(freshdesk, "/api/v2/tickets", "Freshdesk ticket endpoint", "service posts to Freshdesk ticket API");
assertIncludes(freshdesk, "AbortController", "Freshdesk timeout", "service enforces timeout handling");
assertIncludes(freshdesk, "status === 401 || status === 403", "Freshdesk auth failure handling", "service safely classifies auth failures");
assertIncludes(freshdesk, "status === 429", "Freshdesk rate-limit handling", "service safely classifies rate limits");
assertIncludes(freshdesk, "status >= 500", "Freshdesk outage handling", "service safely classifies 5xx failures");
assertIncludes(freshdesk, "product_id", "Freshdesk product ID", "optional product ID is supported");
assertIncludes(freshdesk, "group_id", "Freshdesk group ID", "optional group ID is supported");

assertIncludes(route, "assertSameOriginRequest(request)", "Support CSRF guard", "route requires same-origin requests");
assertIncludes(route, "getAuthenticatedContext()", "Support auth guard", "route requires authenticated app context");
assertIncludes(route, "consumeRateLimit", "Support rate limit", "route rate-limits per user/org");
assertIncludes(route, "parseJsonBody(request, supportTicketRequestSchema)", "Support body validation", "route validates request body");
assertIncludes(route, "getCampaignById(campaignId)", "Support campaign ownership", "campaign context is loaded through the ownership-aware helper");
assertIncludes(route, "getBillingSummaryForCampaign", "Support billing context", "ticket includes campaign-scoped billing context");
assertIncludes(route, "Support is temporarily unavailable. Please try again shortly.", "Support unavailable fallback", "users receive a generic Freshdesk failure message");
assertExcludes(route, "FRESHDESK_API_KEY", "Support route does not read secrets directly", "Freshdesk secrets stay inside server-only service");

assertIncludes(widget, "/api/support/ticket", "Support widget posts to support route", "client uses the Freshdesk-backed API route");
assertIncludes(widget, "MIN_MESSAGE_LENGTH = 10", "Support widget min length", "client validates minimum message length");
assertIncludes(widget, "MAX_MESSAGE_LENGTH = 4000", "Support widget max length", "client validates maximum message length");
assertIncludes(widget, "role=\"dialog\"", "Support modal accessibility", "modal is marked as a dialog");
assertIncludes(widget, "aria-modal=\"true\"", "Support modal aria modal", "modal is accessible");
assertIncludes(widget, "Escape", "Support modal escape close", "Escape closes the modal");
assertIncludes(widget, "campaignId", "Support modal campaign context", "client sends detected campaign context");
assertIncludes(widget, "data-dpl-id", "Support modal deploy marker", "client captures visible deploy marker");
assertExcludes(widget, "FRESHDESK_API_KEY", "Support widget no Freshdesk key", "client code never references Freshdesk secrets");

assertIncludes(layout, "SupportWidget", "Authenticated shell support widget", "support button is mounted inside the authenticated app shell");
assertIncludes(layout, "activeCampaignId={activeCampaignId}", "Support widget active campaign prop", "support context receives active campaign cookie");
assertExcludes(layout, "FeedbackWidget", "Old feedback widget removed from app shell", "client shell now has one Support button");

for (const envName of ["FRESHDESK_DOMAIN", "FRESHDESK_API_KEY", "FRESHDESK_PRODUCT_ID", "FRESHDESK_GROUP_ID"]) {
  assertIncludes(envExample, `${envName}=`, `Env example ${envName}`, "env names are documented without production values");
  assertIncludes(docs, envName, `Support docs ${envName}`, "support runbook documents env name");
}

assertIncludes(docs, "Support is temporarily unavailable. Please try again shortly.", "Support docs fallback copy", "runbook documents missing-env fallback");
assertIncludes(docs, "server-side only", "Support docs server-only Freshdesk", "runbook documents no browser Freshdesk calls");

if (process.exitCode) {
  process.exit(process.exitCode);
}
