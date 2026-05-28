#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const offboardingSource = fs.readFileSync("src/lib/services/campaign-offboarding-cleanup-service.ts", "utf8");
const suspensionSource = fs.readFileSync("src/lib/services/subscription-suspension-service.ts", "utf8");
const billingSource = fs.readFileSync("src/lib/services/billing-service.ts", "utf8");
const systemJobSource = fs.readFileSync("src/lib/services/system-job-service.ts", "utf8");
const envSource = fs.readFileSync("src/lib/env.ts", "utf8");
const metaRequestSource = fs.readFileSync("src/lib/integrations/meta/request.ts", "utf8");
const operatorDebtSource = fs.readFileSync("scripts/check-operator-debt.mjs", "utf8");
const dryRunScriptSource = fs.readFileSync("scripts/audit-campaign-offboarding-cleanup.mjs", "utf8");

assert.match(systemJobSource, /"campaign_offboarding_cleanup"/, "system job kind must include campaign offboarding cleanup");
assert.match(systemJobSource, /runCampaignOffboardingCleanupJob/, "system job worker must process offboarding cleanup jobs");
assert.doesNotMatch(
  systemJobSource.match(/const SUBSCRIPTION_GATED_JOB_KINDS[\s\S]*?\]\);/)?.[0] ?? "",
  /campaign_offboarding_cleanup/,
  "offboarding cleanup must run after suspension instead of being skipped by subscription gating",
);

assert.match(envSource, /ENABLE_META_OFFBOARDING_DELETION/, "Meta deletion must be env-gated");
assert.match(envSource, /ENABLE_CREATIVE_STORAGE_OFFBOARDING_DELETION/, "storage deletion must be env-gated");
assert.match(metaRequestSource, /offboarding_delete/, "Meta request wrapper must classify offboarding deletes explicitly");

assert.match(
  billingSource,
  /entitlementState\.requiresSuspension[\s\S]*queueSubscriptionSuspensionJobsForOrganization/,
  "billing sync must only enqueue cleanup after the canonical suspension signal",
);
assert.match(
  billingSource,
  /stripeSubscriptionId:\s*subscription\.id/,
  "offboarding idempotency must include the Stripe subscription id",
);
assert.match(
  billingSource,
  /billingEndedAt:\s*currentPeriodEndIso \?\? new Date\(\)\.toISOString\(\)/,
  "offboarding jobs must carry the access-ended timestamp",
);
assert.doesNotMatch(
  billingSource,
  /fetchMetaJson|storage\s*\.\s*from|remove\(/,
  "Stripe billing sync must not call Meta or delete storage inline",
);

assert.match(suspensionSource, /queueCampaignOffboardingCleanupJobsForOrganization/, "suspension path must queue offboarding jobs");
assert.match(suspensionSource, /campaign_offboarding\.queue_failed/, "offboarding queue failures must be logged separately");
assert.match(
  suspensionSource,
  /return jobs;/,
  "subscription suspension still returns the suspension jobs while cleanup remains separately queued",
);

assert.match(offboardingSource, /collectDealFlowCreatedMetaObjects/, "Meta inventory must be a dedicated provenance collector");
assert.match(offboardingSource, /plan\.launch_runtime\.campaign_id/, "offboarding must use saved launch runtime campaign id provenance");
assert.match(offboardingSource, /plan\.runtime\.campaignId/, "offboarding must use saved runtime campaign id provenance");
assert.match(offboardingSource, /meta_campaign_id_missing/, "ambiguous Meta provenance must block review");
assert.match(offboardingSource, /billing_reactivated/, "reactivated billing must abort cleanup");
assert.match(offboardingSource, /skipped_reactivated/, "reactivation skip result must be explicit");
assert.match(offboardingSource, /pauseMetaCampaign/, "Meta campaign must be paused before deletion");
assert.match(offboardingSource, /ad:\s*0[\s\S]*adset:\s*2[\s\S]*campaign:\s*3/, "delete order must be ads before ad sets before campaign");
assert.match(offboardingSource, /method:\s*"DELETE"/, "Meta apply step must use explicit delete calls");
assert.match(offboardingSource, /already_deleted/, "Meta deletion reruns must treat already-deleted objects as idempotent success");
assert.match(offboardingSource, /isMetaOffboardingDeletionEnabled\(\)/, "Meta delete apply step must check kill switch");
assert.match(offboardingSource, /isCreativeStorageOffboardingDeletionEnabled\(\)/, "storage delete apply step must check kill switch");
assert.match(offboardingSource, /\.storage[\s\S]*\.from\(STATIC_CREATIVE_STORAGE_BUCKET\)[\s\S]*\.remove\(params\.paths\)/, "storage cleanup must delete only collected app-owned paths");
assert.doesNotMatch(offboardingSource, /\.from\("creative_assets"\)[\s\S]{0,240}\.delete\(/, "creative asset evidence rows must not be deleted");
assert.match(offboardingSource, /offboardingStatus:\s*"deleted"/, "creative asset metadata must record offboarding status");
assert.match(offboardingSource, /storageDeletedAt/, "creative asset metadata must record storage deletion timestamp");
assert.match(offboardingSource, /deletedStoragePaths/, "creative asset metadata must record deleted storage paths");
assert.match(offboardingSource, /selectedLaunchMediaAudit/, "historical selected media IDs must be preserved in audit metadata");
assert.match(offboardingSource, /selected_ad_ids:\s*\[\]/, "current selected static IDs must be cleared after offboarding");
assert.match(offboardingSource, /launch_status:\s*"offboarded"/, "campaign runtime must be marked offboarded");

assert.match(operatorDebtSource, /selectedBlockedStaticAssets/, "operator debt must still guard blocked selected static assets");
assert.match(dryRunScriptSource, /mode:\s*"dry_run"/, "offboarding dry-run script must be inventory-only");
assert.match(dryRunScriptSource, /metaObjectCount/, "dry-run script must print Meta object counts");
assert.match(dryRunScriptSource, /appOwnedStoragePathCount/, "dry-run script must print app-owned asset counts");
assert.doesNotMatch(dryRunScriptSource, /access_token|encryptedToken|signedUrl|privateUrl/i, "dry-run output must not expose tokens or private URLs");

console.log("campaign offboarding cleanup tests passed");
