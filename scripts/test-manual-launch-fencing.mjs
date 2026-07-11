#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const routeSource = fs.readFileSync("src/app/api/campaigns/[id]/launch/route.ts", "utf8");
const auditSource = fs.readFileSync(
  "src/lib/services/campaign-launch-audit-service.ts",
  "utf8",
);
const metaLaunchSource = fs.readFileSync("src/app/api/campaigns/create/route.ts", "utf8");
const metaServiceSource = fs.readFileSync("src/lib/integrations/meta/service.ts", "utf8");
const launchInputSource = fs.readFileSync("src/lib/meta-launch-input-snapshot.ts", "utf8");
const migrationSource = fs.readFileSync(
  "supabase/migrations/20260710235500_schedule_launch_claim_fencing.sql",
  "utf8",
);

assert.match(routeSource, /const MANUAL_LAUNCH_LEASE_MS = 30 \* 60_000/);
assert.match(routeSource, /const MANUAL_LAUNCH_HEARTBEAT_MS = 60_000/);
assert.doesNotMatch(routeSource, /META_LAUNCH_LOCK_MS = 15 \* 60_000/);
assert.match(routeSource, /claimManualCampaignLaunch\(/);
assert.match(routeSource, /CampaignLaunchOperatorActionRequiredError/);
assert.match(routeSource, /operator_action_id: error\.operatorActionId/);
assert.match(routeSource, /renewManualCampaignLaunchClaim\(/);
assert.match(routeSource, /loadManualCampaignLaunchProviderResume\(/);
assert.match(routeSource, /getCampaignLaunchRecordForCampaign\(/);
assert.match(routeSource, /completedReceipt\?\.resultStatus === "success"/);
assert.match(routeSource, /receipted: completedCreativeId/);
assert.match(routeSource, /already_launched: true/);
assert.match(routeSource, /recordManualCampaignLaunchProviderReceipt\(/);
assert.match(routeSource, /armManualCampaignLaunchProviderMutation\(/);
assert.match(routeSource, /settleManualCampaignLaunchProviderMutation\(/);
assert.match(routeSource, /bindManualCampaignLaunchInputSnapshot\(/);
assert.match(routeSource, /completeManualCampaignLaunchClaim\(/);
assert.match(routeSource, /failManualCampaignLaunchClaim\(/);
assert.match(routeSource, /assertProviderMutationAllowed: assertClaimAndLocks/);
assert.match(routeSource, /recordProviderReceipt: \(receipt\)/);
assert.match(routeSource, /setInterval\(\(\) =>/);
assert.match(routeSource, /launchLeaseGeneration/);
assert.match(routeSource, /launchInputDigest = binding\.digest/);
assert.match(routeSource, /code: launchError\.code/);
assert.doesNotMatch(routeSource, /new URL\(request\.url\)\.origin/);
assert.doesNotMatch(routeSource, /getMetaWorkspaceCredentials\(\)/);
assert.doesNotMatch(routeSource, /await recordCampaignLaunch\(/);

assert.match(auditSource, /if \(params\.campaignId\) \{/);
assert.match(auditSource, /campaign_launch_claim_required/);
assert.match(auditSource, /rpc\("claim_manual_campaign_launch_record"/);
assert.match(auditSource, /"processing",/);
assert.match(auditSource, /campaign_launch_claim_terminal_lookup_failed/);
assert.match(auditSource, /rpc\("complete_manual_campaign_launch_claim"/);
assert.match(auditSource, /rpc\("fail_manual_campaign_launch_claim"/);
assert.match(auditSource, /rpc\("record_legacy_campaign_launch"/);
assert.match(auditSource, /rpc\(\s*"arm_campaign_launch_provider_mutation"/);
assert.match(auditSource, /rpc\(\s*"settle_campaign_launch_provider_mutation"/);
assert.match(auditSource, /rpc\(\s*"bind_campaign_launch_input_snapshot"/);
assert.doesNotMatch(auditSource, /from\("campaign_launch_records"\)\.upsert/);
assert.match(auditSource, /rpc\(\s*"persist_campaign_launch_runtime_claim"/);
assert.match(routeSource, /persistManualCampaignLaunchRuntime\(/);

assert.match(migrationSource, /create or replace function public\.claim_manual_campaign_launch_record/);
assert.match(migrationSource, /for update;/i);
assert.match(migrationSource, /schedule_lease_generation = candidate\.schedule_lease_generation \+ 1/);
assert.match(migrationSource, /create or replace function public\.complete_manual_campaign_launch_claim/);
assert.match(migrationSource, /candidate\.schedule_lease_token = p_lease_token/);
assert.match(migrationSource, /candidate\.schedule_lease_generation = p_lease_generation/);
assert.match(migrationSource, /candidate\.schedule_locked_until > timezone\('utc', now\(\)\)/);
assert.match(migrationSource, /count\(distinct receipt\.object_id\)/);
assert.match(migrationSource, /manual launch completion does not match its successful provider receipts/);
assert.match(migrationSource, /create or replace function public\.persist_campaign_launch_runtime_claim/);
assert.match(migrationSource, /terminal launch runtime must be persisted by the completion RPC/);
assert.match(migrationSource, /scheduled launch completion does not match successful provider receipts/);
assert.match(migrationSource, /meta_creative_id = trim\(p_meta_creative_id\)/);
assert.match(migrationSource, /'metaPushStatus', 'provider_paused'/);
assert.match(migrationSource, /launch_status = 'provider_paused'/);
assert.match(migrationSource, /create or replace function public\.record_legacy_campaign_launch/);
assert.match(migrationSource, /create or replace function public\.arm_campaign_launch_provider_mutation/);
assert.match(migrationSource, /create or replace function public\.settle_campaign_launch_provider_mutation/);
assert.match(migrationSource, /ambiguous_until_receipted_or_explicitly_rejected/);
assert.match(migrationSource, /meta_provider_create_outcome_ambiguous/);
assert.match(migrationSource, /operatorActionId/);
assert.match(migrationSource, /create or replace function public\.bind_campaign_launch_input_snapshot/);
assert.match(migrationSource, /launch_input_snapshot_mismatch/);
assert.match(migrationSource, /receipt\.launch_input_digest = launch\.launch_input_digest/);
assert.match(migrationSource, /completion input lineage does not match its durable snapshot/);
assert.match(migrationSource, /launch\.launch_input_snapshot -> 'provider' ->> 'pixel_id'/);
assert.match(migrationSource, /launch\.launch_input_snapshot ->> 'destination_host'/);
assert.match(migrationSource, /'launchInputDigest', launch_input_digest/);
assert.match(
  migrationSource,
  /revoke insert, update, delete, truncate, references, trigger\s+on public\.campaign_launch_records from service_role/,
);
assert.match(migrationSource, /create or replace function public\.fail_manual_campaign_launch_claim/);
assert.match(
  migrationSource,
  /revoke execute on function public\.claim_manual_campaign_launch_record[\s\S]*?from public, anon, authenticated/,
);
assert.doesNotMatch(metaLaunchSource, /\.from\("campaign_plans"\)\s*\.update\(/);
assert.match(metaLaunchSource, /error\.code === "campaign_launch_lease_lost"/);
assert.match(metaLaunchSource, /adStatusCode >= 200 && adStatusCode < 300/);
assert.match(metaLaunchSource, /adFailureContract\?\.status \?\? adStatusCode/);
assert.match(metaLaunchSource, /getExplicitMetaProviderRejectionCode/);
for (const [stage, objectKey] of [
  ["campaign", "campaignObjectKey"],
  ["adset", "adSetObjectKey"],
  ["creative", "creativeObjectKey"],
  ["ad", "adObjectKey"],
]) {
  assert.match(
    metaLaunchSource,
    new RegExp(`await armProviderMutation\\("${stage}", ${objectKey}\\);`),
    `${stage} create is not durably armed before the provider POST`,
  );
}
assert.match(metaLaunchSource, /outcome: "receipted"/);
assert.match(metaLaunchSource, /outcome: "explicit_provider_rejection"/);
assert.match(metaLaunchSource, /meta_provider_create_outcome_ambiguous/);
assert.match(metaLaunchSource, /validateMetaLaunchSelectionsForOrganization\(\{/);
assert.doesNotMatch(metaLaunchSource, /validateMetaLaunchSelections\(\{ destinationUrl \}\)/);
assert.match(metaLaunchSource, /code: safeErrorCode/);
assert.match(metaLaunchSource, /campaign_launch_provider_receipt_persist_failed/);
assert.match(metaServiceSource, /meta_launch_selection_snapshot_changed/);
assert.match(metaServiceSource, /currentCredentials\.adAccountId !== params\.credentials\.adAccountId/);
assert.match(metaServiceSource, /currentCredentials\.accessToken !== params\.credentials\.accessToken/);
const bindIndex = metaLaunchSource.indexOf("await options.bindLaunchInputSnapshot(");
const preflightIndex = metaLaunchSource.indexOf("const preflight =", bindIndex);
const firstRecoveryLookupIndex = metaLaunchSource.indexOf("fetchMetaObjectByName({", bindIndex);
assert.ok(bindIndex >= 0, "immutable launch input binding is missing");
assert.ok(preflightIndex > bindIndex, "launch input binding must precede provider preflight");
assert.ok(
  firstRecoveryLookupIndex > bindIndex,
  "launch input binding must precede provider recovery or creation calls",
);
assert.match(launchInputSource, /primary_text_sha256/);
assert.match(launchInputSource, /headline_sha256/);
assert.match(launchInputSource, /ad_account_id/);
assert.match(launchInputSource, /destination_host/);
assert.doesNotMatch(launchInputSource, /accessToken|access_token/);

for (const [stage, responseAssignment, failureMarker] of [
  ["campaign", "campaignData = campaignResponseData;", "if (!campaignResponse.ok"],
  ["adset", "adSetData = adSetResponseData;", "if (!adSetResponse.ok"],
  ["creative", "creativeData = creativeResponseData;", "if (!creativeResponse.ok"],
  ["ad", "adData = adResponseData;", "const adResponseAccepted ="],
]) {
  const start = metaLaunchSource.indexOf(responseAssignment);
  const end = metaLaunchSource.indexOf(failureMarker, start);
  const block = metaLaunchSource.slice(start, end);
  const receiptIndex = block.indexOf("recordProviderReceipt");
  const gateIndex = block.indexOf("await options?.assertProviderMutationAllowed?.();");
  assert.ok(start >= 0 && end > start, `${stage} response block is missing`);
  assert.ok(receiptIndex >= 0, `${stage} provider receipt is missing`);
  assert.ok(gateIndex > receiptIndex, `${stage} provider receipt must precede its post-response gate`);
}

class FencedLaunch {
  constructor() {
    this.status = "scheduled";
    this.generation = 0;
    this.owner = null;
    this.token = null;
    this.expiresAt = 0;
    this.receipts = new Map();
  }

  claim(owner, now) {
    if (this.status === "processing" && this.expiresAt > now) return null;
    this.status = "processing";
    this.generation += 1;
    this.owner = owner;
    this.token = `token-${this.generation}`;
    this.expiresAt = now + 60_000;
    return { owner, token: this.token, generation: this.generation };
  }

  owns(claim, now) {
    return this.status === "processing" &&
      this.owner === claim.owner &&
      this.token === claim.token &&
      this.generation === claim.generation &&
      this.expiresAt > now;
  }

  receipt(claim, stage, objectId) {
    assert.ok(claim.generation <= this.generation, "future receipt generation");
    this.receipts.set(`${claim.generation}:${stage}`, objectId);
  }

  complete(claim, now) {
    if (!this.owns(claim, now)) return false;
    for (const stage of ["campaign", "adset", "creative", "ad"]) {
      const ids = new Set(
        Array.from(this.receipts)
          .filter(([key]) => Number(key.split(":")[0]) <= claim.generation && key.endsWith(`:${stage}`))
          .map(([, value]) => value),
      );
      if (ids.size !== 1) return false;
    }
    this.status = "success";
    this.owner = null;
    this.token = null;
    return true;
  }
}

const launch = new FencedLaunch();
const first = launch.claim("first", 0);
assert.ok(first);
for (const stage of ["campaign", "adset", "creative", "ad"]) {
  launch.receipt(first, stage, `same-${stage}`);
}
const replacement = launch.claim("replacement", 60_001);
assert.ok(replacement);
assert.equal(launch.complete(first, 60_002), false, "expired worker completed after replacement");
for (const stage of ["campaign", "adset", "creative", "ad"]) {
  launch.receipt(replacement, stage, `same-${stage}`);
}
assert.equal(launch.complete(replacement, 60_003), true, "replacement could not recover same receipts");
assert.equal(launch.complete(first, 60_004), false, "stale worker overwrote terminal success");

console.log(
  "PASS manual launch fencing: renewable generation claim, pre-gate receipts, stale-write denial, and same-ID recovery",
);
