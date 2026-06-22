#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} must include ${needle}`);
}

const operatorAssisted = read("src/lib/integrations/meta/operator-assisted.ts");
const types = read("src/lib/integrations/meta/types.ts");
const service = read("src/lib/integrations/meta/service.ts");
const errorMapper = read("src/lib/integrations/meta/error-mapper.ts");
const launchPage = read("src/app/(app)/launch/page.tsx");
const launchSuccessPage = read("src/app/(app)/launch-success/page.tsx");
const selectionPanel = read("src/components/campaign/launch/launch-meta-selection-panel.tsx");
const controlRoom = read("src/app/(app)/admin/control-room/page.tsx");
const launchRoute = read("src/app/api/campaigns/create/route.ts");
const metaCampaignSyncService = read("src/lib/services/meta-campaign-sync-service.ts");
const martineVerifier = read("scripts/verify-martine-perfect-go-state.mjs");
const martineMetaReadback = read("scripts/verify-martine-meta-readback.mjs");
const martineMetaRuntimeReconcile = read("scripts/reconcile-martine-meta-runtime-readback.mjs");

assertIncludes(
  operatorAssisted,
  "Meta connection is currently operator-assisted. Please confirm you've been added to the Meta app before connecting.",
  "operator-assisted customer copy",
);
assertIncludes(
  operatorAssisted,
  "Add customer to Meta app role before Meta connect.",
  "operator checklist copy",
);

for (const code of [
  "meta_app_role_required",
  "app_not_live",
  "business_verification_required",
  "oauth_access_denied",
  "token_missing",
  "token_expired",
  "page_permission_missing",
  "ad_account_permission_missing",
]) {
  assertIncludes(operatorAssisted, code, `operator-assisted exported code ${code}`);
  assertIncludes(errorMapper, code, `operator-assisted error mapper code ${code}`);
}

assertIncludes(types, "operatorAssisted:", "Meta connection state exposes operator-assisted status");
assertIncludes(service, "operatorAssisted: {", "Meta service returns operator-assisted status");
assertIncludes(service, "META_OPERATOR_ASSISTED_NOTICE", "Meta service uses shared operator-assisted copy");
for (const status of [
  "launch_domain_missing",
  "launch_domain_hosts_missing",
  "launch_domain_not_verified",
  "launch_domain_verified",
  "business_verification_pending",
  "business_verification_required",
  "business_verification_verified",
]) {
  assertIncludes(service, status, `Meta launch readiness status ${status}`);
}
assertIncludes(
  service,
  "Meta Business verification is required before live activation. Paused setup can still proceed.",
  "Meta preflight must keep business verification as a live-activation warning, not a paused setup blocker",
);
assertIncludes(
  service,
  "Meta Business verification is pending. Keep the campaign paused until live activation is approved.",
  "Meta preflight must show pending business verification truthfully",
);
assertIncludes(launchPage, "Meta app access", "launch readiness shows Meta app access");
assertIncludes(launchPage, "metaConnection.operatorAssisted.notice", "launch page shows operator-assisted notice");
assertIncludes(
  launchPage,
  "metaConnection.operatorAssisted.publicSelfServeBlocker",
  "launch page shows public self-serve blocker",
);
assertIncludes(launchPage, "formatLaunchDomainStatus", "launch page must render launch-domain readiness status");
assertIncludes(launchPage, "formatBusinessVerificationStatus", "launch page must render business-verification readiness status");
assertIncludes(
  selectionPanel,
  "liveConnection.operatorAssisted.notice",
  "Meta selection panel shows operator-assisted notice",
);
assertIncludes(
  controlRoom,
  "META_OPERATOR_ASSISTED_ADMIN_CHECKLIST",
  "Control Room shows operator checklist",
);
assertIncludes(
  launchRoute,
  "process.env.ALLOW_META_LIVE_LAUNCH !== \"true\"",
  "campaign launch route keeps live Meta mutation gate",
);
assertIncludes(
  launchSuccessPage,
  "getMetaConnectionStateForOrganization(campaignOrganizationId)",
  "launch success receipt must read the Meta account from the launched campaign organization",
);
assertIncludes(
  launchSuccessPage,
  "launchRecord?.accountName",
  "launch success receipt must fall back to persisted launch record account name before showing no account selected",
);
assertIncludes(
  launchSuccessPage,
  "organizationId: campaignOrganizationId",
  "launch success receipt must read campaign sync snapshots from the launched campaign organization",
);
assertIncludes(
  service,
  "selected_external_account_id",
  "Meta connection state must read selected ad account from connection metadata",
);
assertIncludes(
  service,
  "availableAccounts.find((account) => account.externalAccountId === selectedExternalAccountId)",
  "Meta connection state must resolve selected account name from available accounts metadata",
);
assertIncludes(
  metaCampaignSyncService,
  "effectiveOrganizationId",
  "campaign-specific Meta sync must derive the effective organization from the campaign record",
);
assertIncludes(
  metaCampaignSyncService,
  "organization_id: effectiveOrganizationId",
  "campaign-specific Meta sync snapshots must be written under the campaign organization",
);
assert.doesNotMatch(
  types,
  /accessToken\s*:/,
  "browser-facing MetaConnectionState must not expose access tokens",
);
assert.doesNotMatch(
  martineVerifier,
  /from\(["'][^"']+["']\)[\s\S]{0,240}\.(insert|update|upsert|delete)\(/,
  "Martine verification script must not mutate Supabase tables",
);
assert.doesNotMatch(
  martineVerifier,
  /fetch\(["']https:\/\/graph\.facebook\.com/,
  "Martine verification script must not call live Meta",
);
assertIncludes(
  martineVerifier,
  "expectedSelectedCreativeIds",
  "Martine verification script must assert the three selected static creative ids",
);
assertIncludes(
  martineVerifier,
  "Durable selected creative_assets are canonical for Martine creative count",
  "Martine verification script must treat durable selected creative assets as the canonical creative count",
);
assertIncludes(
  martineVerifier,
  "Launch receipt audit table unavailable; Meta connection state is canonical fallback",
  "Martine verification script must treat Meta connection state as the launch receipt fallback",
);
assertIncludes(
  martineMetaReadback,
  "method: \"GET\"",
  "Martine Meta readback must use GET-only Graph requests",
);
assert.doesNotMatch(
  martineMetaReadback,
  /fetch\([^)]*method:\s*["'](POST|PATCH|DELETE|PUT)["']/,
  "Martine Meta readback must not mutate Graph objects",
);
assert.doesNotMatch(
  martineMetaReadback,
  /from\(["'][^"']+["']\)[\s\S]{0,240}\.(insert|update|upsert|delete)\(/,
  "Martine Meta readback must not mutate Supabase tables",
);
assertIncludes(
  martineMetaReadback,
  "Meta returns exactly three DealFlow runtime ads",
  "Martine Meta readback must prove the three-ad state",
);
assertIncludes(
  martineMetaRuntimeReconcile,
  "RECONCILE_MARTINE_META_RUNTIME_READBACK",
  "Martine Meta runtime repair must require explicit confirmation",
);
assertIncludes(
  martineMetaRuntimeReconcile,
  "campaign_plans.plan.launch_runtime.creative_ids only",
  "Martine Meta runtime repair must be scoped to launch runtime creative ids",
);
assert.doesNotMatch(
  martineMetaRuntimeReconcile,
  /fetch\([^)]*method:\s*["'](POST|PATCH|DELETE|PUT)["']/,
  "Martine Meta runtime repair must not mutate Graph objects",
);
assert.doesNotMatch(
  martineMetaRuntimeReconcile,
  /from\(["']creative_assets["']\)[\s\S]{0,240}\.(insert|update|upsert|delete)\(/,
  "Martine Meta runtime repair must not mutate creative_assets",
);

console.log("Meta operator-assisted beta contract tests passed.");
