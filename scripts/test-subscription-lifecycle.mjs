#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync("src/lib/services/campaign-entitlements.ts", "utf8");
const suspensionSource = fs.readFileSync("src/lib/services/subscription-suspension-service.ts", "utf8");
const systemJobSource = fs.readFileSync("src/lib/services/system-job-service.ts", "utf8");
const leadRouteSource = fs.readFileSync("src/app/api/lead-capture/route.ts", "utf8");
const publicFunnelSource = fs.readFileSync("src/app/f/[slug]/page.tsx", "utf8");
const notificationSource = fs.readFileSync("src/lib/services/internal-lead-notification-service.ts", "utf8");

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
});

const exportsObject = {};
const sandbox = {
  exports: exportsObject,
  module: { exports: exportsObject },
  require(specifier) {
    if (specifier === "@/lib/api/route") {
      return {
        ApiError: class ApiError extends Error {
          constructor(status, message, code) {
            super(message);
            this.status = status;
            this.code = code;
          }
        },
      };
    }

    if (specifier === "@/lib/billing/plans") {
      return {
        normalizeBillingPlanTier(value) {
          return value === "pro" || value === "starter" ? value : "starter";
        },
        hasFeatureAccess(planTier, feature) {
          if (feature === "meta_launch") return planTier === "starter" || planTier === "pro";
          if (feature === "autonomy_access") return planTier === "pro";
          return false;
        },
      };
    }

    if (specifier === "@/lib/supabase/admin") {
      return { createAdminClient: () => null };
    }

    if (specifier === "@/lib/services/app-context") {
      return { getAppContext: async () => null };
    }

    if (specifier === "@/lib/env") {
      return {
        isBillingAdminOverrideEmail: () => false,
        isBillingAdminOverrideEnabled: () => false,
        isInternalAdminEmail: () => false,
      };
    }

    throw new Error(`Unexpected import in entitlement policy test: ${specifier}`);
  },
};

vm.runInNewContext(transpiled.outputText, sandbox, {
  filename: "campaign-entitlements.ts",
});

const { evaluateCampaignEntitlements } = sandbox.module.exports;
const now = new Date("2026-05-04T12:00:00.000Z");
const future = "2026-06-04T12:00:00.000Z";
const past = "2026-04-04T12:00:00.000Z";

function row(status, overrides = {}) {
  return {
    plan_tier: "starter",
    status,
    current_period_end: future,
    cancel_at_period_end: false,
    ...overrides,
  };
}

assert.equal(evaluateCampaignEntitlements({ row: row("active"), now }).billingState, "active");
assert.equal(evaluateCampaignEntitlements({ row: row("active"), now }).canLaunch, true);
assert.equal(evaluateCampaignEntitlements({ row: row("active", { plan_tier: "pro" }), now }).canRunAutonomy, true);
assert.equal(evaluateCampaignEntitlements({ row: row("active"), now }).canRunAutonomy, false);

const cancelFuture = evaluateCampaignEntitlements({
  row: row("active", { cancel_at_period_end: true, current_period_end: future }),
  now,
});
assert.equal(cancelFuture.billingState, "grace_period");
assert.equal(cancelFuture.canCaptureLeads, true);
assert.equal(cancelFuture.canLaunch, true);
assert.equal(cancelFuture.requiresSuspension, false);

const cancelEnded = evaluateCampaignEntitlements({
  row: row("canceled", { cancel_at_period_end: true, current_period_end: past }),
  now,
});
assert.equal(cancelEnded.billingState, "suspended");
assert.equal(cancelEnded.canCaptureLeads, false);
assert.equal(cancelEnded.canSendLeadAlerts, false);
assert.equal(cancelEnded.canRunOptimization, false);
assert.equal(cancelEnded.requiresSuspension, true);

const pastDue = evaluateCampaignEntitlements({ row: row("past_due"), now });
assert.equal(pastDue.billingState, "payment_issue");
assert.equal(pastDue.canLaunch, false);
assert.equal(pastDue.canCaptureLeads, true);
assert.equal(pastDue.requiresSuspension, false);

const override = evaluateCampaignEntitlements({
  row: row("unpaid"),
  launchOverride: true,
  now,
});
assert.equal(override.billingState, "active");
assert.equal(override.canLaunch, true);
assert.equal(override.requiresSuspension, false);

assert.match(suspensionSource, /collectManagedMetaObjects/);
assert.match(suspensionSource, /runtime\.campaignId/);
assert.match(suspensionSource, /launchRuntime\.campaign_id/);
assert.match(suspensionSource, /runtime\.metaAdSetIds/);
assert.match(suspensionSource, /runtime\.metaAdIds/);
assert.match(suspensionSource, /idempotencyKey: `subscription_suspension:/);
assert.match(suspensionSource, /dryRun: process\.env\.DEALFLOW_SUSPENSION_DRY_RUN === "true"/);
assert.doesNotMatch(suspensionSource, /delete\s*\(/i);
assert.match(systemJobSource, /"subscription_suspension"/);
assert.match(systemJobSource, /SUBSCRIPTION_GATED_JOB_KINDS/);
assert.match(systemJobSource, /subscription_inactive/);
assert.match(leadRouteSource, /campaign_subscription_inactive/);
assert.match(publicFunnelSource, /Campaign paused/);
assert.match(notificationSource, /reason: "subscription_inactive"/);

console.log("Subscription lifecycle entitlement and safety tests passed.");
