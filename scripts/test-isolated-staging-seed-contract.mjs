#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "scripts", "seed-isolated-staging.mjs"), "utf8");
const envExample = readFileSync(join(root, ".env.example"), "utf8");
const activationMigration = readFileSync(
  join(root, "supabase", "migrations", "20260713012000_require_meta_activation_preauthorization.sql"),
  "utf8",
);
const partnerBindingMigration = readFileSync(
  join(root, "supabase", "migrations", "20260713015000_bind_verified_partner_attribution_atomically.sql"),
  "utf8",
);

assert.match(source, /FIXTURE_LABEL = "DF-STAGING-20260712"/);
assert.match(source, /FIXTURE_TIMESTAMP = "2026-07-12T12:00:00\.000Z"/);
assert.match(source, /EXPECTED_QA_EMAIL = "dealflow-staging-20260712@example\.com"/);
assert.match(source, /QA_EMAIL must match the exact synthetic staging fixture identity/);
assert.match(source, /EXPECTED_STAGING_PROJECT_FINGERPRINT/);
assert.match(source, /c4d7f6ba9f2c678101b45b453998c4fa5755d8ec038f6cfd3ca8de957a0d1f4c/);
assert.match(source, /EXPECTED_STAGING_SAFE_SUFFIX = "qibh"/);
assert.match(source, /EXPECTED_STAGING_APP_HOST = "dealflow-os-rebuild-selfserve-clean\.vercel\.app"/);
assert.match(source, /NEXT_PUBLIC_APP_URL must match the exact isolated staging application host/);
assert.match(source, /function assertStagingPartnerAppUrl\(rawUrl\)/);
assert.match(source, /STAGING_PARTNER_APP_URL must be a distinct deployment-bound Vercel staging URL/);
assert.match(source, /url\.hostname === EXPECTED_STAGING_APP_HOST/);
assert.match(source, /url\.hostname\.endsWith\("\.vercel\.app"\)/);
assert.match(source, /url\.hostname\.startsWith\("dealflow-os-rebuild-selfserve-clean-"\)/);
assert.match(source, /const partnerAppHost = new URL\(partnerAppUrl\)\.hostname/);
assert.doesNotMatch(source, /STAGING_ISOLATED_SUPABASE_PROJECT_REF/);
assert.doesNotMatch(source, /projectRef:\s*projectRef/);
assert.match(source, /projectFingerprint: sha256\(attestedProjectRef\)/);
assert.match(source, /published_at: FIXTURE_TIMESTAMP/);
assert.match(source, /isolated staging auth surface contains a non-attested identity/);
assert.match(source, /isolated staging auth surface contains an incorrectly labeled identity/);
for (const scenario of [
  "new_unpaid_direct_realtor",
  "paid_direct_realtor",
  "grandfathered_legacy_realtor",
  "active_white_label_partner_admin",
  "white_label_child_realtor",
  "internal_admin_operator",
  "cross_tenant_attacker",
]) {
  assert.match(source, new RegExp(`key: "${scenario}"`), `missing ${scenario} fixture`);
}
assert.match(source, /EXPECTED_SYNTHETIC_AUTH_EMAILS/);
assert.match(source, /ensureSyntheticAuthUser/);
assert.match(source, /scenario: scenario\.key/);
assert.match(source, /role: "member"/);
assert.match(source, /Workspace[\s\S]{0,80}ownership is still bound by organizations\.owner_user_id/);
assert.match(source, /PARTNER_ATTRIBUTION_SIGNING_SECRET/);
assert.match(source, /must be a strong staging-only secret/);
assert.match(source, /platform: "meta_ads"/);
assert.doesNotMatch(source, /platform: "meta"/);
assert.match(source, /providerAdAccountId: "900000000000001"/);
assert.match(source, /externalAdAccountId: "act_900000000000001"/);
assert.match(source, /providerPageId: "900000000000002"/);
assert.match(source, /providerPixelId: "900000000000003"/);
assert.match(source, /currency: "CAD"/);
assert.match(source, /selectedAdId: "df-staging-static-20260712"/);
assert.match(source, /dailyBudgetCents: 1_000/);
assert.match(source, /adDestination: "meta_instant_form"/);
assert.match(source, /LAUNCH_TIME_ZONE = "America\/New_York"/);
assert.match(source, /function getNextEligibleLaunchAt\(now\)/);
assert.match(source, /getNextEligibleLaunchAt\(new Date\(\)\)\.toISOString\(\)/);
assert.doesNotMatch(source, /act_df_staging_20260712/);
assert.doesNotMatch(source, /pixel_df_staging_20260712/);
assert.match(source, /daily_budget_cents: META_FIXTURE\.dailyBudgetCents/);
assert.match(source, /ad_destination: META_FIXTURE\.adDestination/);
assert.match(source, /destination_url: destinationUrl/);
assert.match(source, /selected_ad_id: META_FIXTURE\.selectedAdId/);
assert.match(source, /staticAds: \[\{[\s\S]*id: META_FIXTURE\.selectedAdId/);
assert.match(source, /creative_id: META_FIXTURE\.selectedAdId/);
assert.match(source, /generation_method: "image_generation"/);
assert.match(source, /source: "static_ad"/);
assert.match(source, /staticAssetId: META_FIXTURE\.selectedAdId/);
assert.match(source, /selected_external_account_id: META_FIXTURE\.externalAdAccountId/);
assert.match(source, /selected_account_name: `\$\{FIXTURE_LABEL\} Meta Sandbox`/);
assert.match(source, /selected_account_currency: META_FIXTURE\.currency/);
assert.match(source, /selected_page_id: META_FIXTURE\.providerPageId/);
assert.match(source, /selected_page_name: `\$\{FIXTURE_LABEL\} Facebook Page`/);
assert.match(source, /pixel_id: META_FIXTURE\.providerPixelId/);
assert.match(source, /available_accounts: \[\{[\s\S]*currency: META_FIXTURE\.currency/);
assert.match(source, /available_pages: \[\{[\s\S]*id: META_FIXTURE\.providerPageId/);
assert.match(source, /available_pixels: \[\{[\s\S]*id: META_FIXTURE\.providerPixelId/);
assert.match(source, /access_token_encrypted: null/);
assert.match(source, /refresh_token_encrypted: null/);
assert.match(source, /token_expires_at: null/);
assert.match(source, /verification_token: null/);
assert.match(source, /provider_actions_allowed: false/);
assert.match(source, /providerMutationPerformed: false/);
assert.match(source, /customerPreauthorizationRequired !== true/);
assert.doesNotMatch(source, /upsert\(admin, "campaign_launch_records"/);
assert.match(source, /schedule_and_preauthorize_meta_campaign_activation/);
assert.match(
  activationMigration,
  /create or replace function public\.schedule_and_preauthorize_meta_campaign_activation\(/,
);
assert.match(activationMigration, /p_launch_approval_snapshot jsonb/);
assert.match(activationMigration, /customerPreauthorizationRequired', true/);
assert.match(
  activationMigration,
  /grant execute on function public\.schedule_and_preauthorize_meta_campaign_activation[\s\S]+to service_role;/,
);
assert.match(source, /p_customer_user_id: userId/);
assert.match(source, /p_campaign_name: campaignPlan\.campaign_name/);
assert.match(source, /p_scheduled_for: scheduledFor/);
assert.match(source, /p_time_zone: LAUNCH_TIME_ZONE/);
assert.match(source, /p_approved_daily_budget_minor: META_FIXTURE\.dailyBudgetCents/);
assert.match(source, /p_approved_currency: META_FIXTURE\.currency/);
assert.match(source, /p_provider_ad_account_id: META_FIXTURE\.providerAdAccountId/);
assert.match(source, /p_provider_page_id: META_FIXTURE\.providerPageId/);
assert.match(source, /p_provider_pixel_id: META_FIXTURE\.providerPixelId/);
assert.match(source, /p_selected_ad_id: META_FIXTURE\.selectedAdId/);
assert.match(source, /p_ad_destination: META_FIXTURE\.adDestination/);
assert.match(source, /p_destination_url_digest: sha256\(destinationUrl\)/);
assert.match(source, /p_launch_approval_snapshot: launchApprovalSnapshot/);
assert.match(source, /schema_version: 1/);
assert.match(source, /provider_form_id: null/);
assert.match(source, /const syntheticCreativeUrl = `\$\{publicAppUrl\}\/logo\.svg`/);
assert.match(source, /readFileSync\(new URL\("\.\.\/public\/logo\.svg", import\.meta\.url\)\)/);
assert.match(source, /image_content_sha256: syntheticCreativeContentDigest/);
assert.doesNotMatch(source, /image_url_sha256/);
assert.doesNotMatch(source, /example\.invalid/);
assert.match(source, /form_definition_digest: sha256/);
assert.match(source, /special_ad_categories: \["HOUSING"\]/);
assert.match(source, /replay\?\.id !== preauthorization\?\.id/);
assert.match(source, /read back existing synthetic atomic Meta activation preauthorization/);
assert.match(source, /read back synthetic atomic launch fixture/);
assert.match(source, /meta_campaign_id !== null/);
assert.match(source, /meta_creative_id !== null/);
assert.match(source, /read back synthetic canonical campaign fixture/);
assert.match(source, /canonicalPlan\?\.daily_budget_cents !== META_FIXTURE\.dailyBudgetCents/);
assert.match(source, /canonicalPayload\?\.destination_url !== destinationUrl/);
assert.match(source, /canonicalStaticAds\[0\]\?\.id !== META_FIXTURE\.selectedAdId/);
assert.match(source, /read back synthetic canonical creative fixture/);
assert.match(source, /canonicalCreativeTruth\.creative_id !== META_FIXTURE\.selectedAdId/);
assert.match(source, /availableAccounts\.length !== 1/);
assert.match(source, /availablePages\.length !== 1/);
assert.match(source, /availablePixels\.length !== 1/);
assert.match(source, /contains provider authority/);
assert.match(source, /p_amount_paid_cents: 29_700/);
assert.match(source, /p_currency: "usd"/);
const activationInputBody = /const activationInput = \{([\s\S]*?)\n  \};/.exec(source)?.[1];
assert.ok(activationInputBody, "activation input object must remain statically inspectable");
assert.equal(
  activationInputBody.match(/p_source_event_id:/g)?.length,
  1,
  "activation input must contain exactly one p_source_event_id key",
);
assert.match(source, /activationReplay\?\.reused_existing !== true/);
assert.match(source, /activationTruth\.amount_paid_cents !== 29_700/);
assert.match(source, /initialCreditTruth\.delta !== 1_000/);
assert.match(source, /initialCreditTruth\.balance_after !== 1_000/);
assert.match(source, /commercial_activation_initial_credit:/);
assert.match(source, /request_ghl_provisioning_from_billing_activation_v1/);
assert.doesNotMatch(source, /grant_user_credits/);
assert.match(source, /verify exact synthetic commercial activation count/);
assert.match(source, /verify exact synthetic initial-credit count/);
assert.match(source, /verify exact synthetic GHL activation-request count/);
assert.match(source, /verify exact synthetic atomic launch count/);
assert.match(source, /verify exact synthetic Meta preauthorization count/);
assert.match(source, /metaActivationReplayIdempotent: true/);
assert.match(source, /exactFixtureCountsVerified: true/);
assert.match(source, /does not contain the exact synthetic auth-user set/);
assert.match(source, /exactSyntheticAuthUserCount: finalAuthUsers\.length/);
assert.match(source, /verify new direct realtor remains unpaid/);
assert.match(source, /verify new direct realtor remains commercially inactive/);
assert.match(source, /legacy_plan_tier_reconciled: "true"/);
assert.match(source, /legacy_commercial_activation_reconciled: true/);
assert.match(source, /verify exact grandfathered legacy billing fixture/);
assert.match(source, /upsert\(admin, "partners"/);
assert.match(source, /upsert\(admin, "partner_memberships"/);
assert.match(source, /partnerAdminOrganization: "d1000000-0000-4000-8000-000000000013"/);
assert.match(source, /slug: "df-staging-partner-administration"/);
assert.match(source, /partnerId: IDS\.partner/);
assert.match(source, /upsert\(admin, "partner_branding"/);
assert.match(source, /upsert\(admin, "partner_domains"/);
assert.doesNotMatch(source, /upsert\(admin, "workspace_partner_attribution"/);
assert.match(source, /admin\.rpc\("bind_verified_partner_attribution_v1"/);
assert.match(source, /scenarioName !== "partnerChild" && scenarioName !== "partnerAdmin"/);
assert.doesNotMatch(source, /const partnerId = \["partnerAdmin", "partnerChild"\]/);
assert.match(source, /p_user_id: scenarioUserIds\.partnerChild/);
assert.match(source, /p_organization_id: IDS\.partnerChildOrganization/);
assert.match(source, /p_verified_domain: partnerAppHost/);
assert.match(source, /\["bound", "already_bound"\]/);
assert.match(source, /attributionBoundAtomically: true/);
assert.match(partnerBindingMigration, /create or replace function public\.bind_verified_partner_attribution_v1/);
assert.match(partnerBindingMigration, /auth\.role\(\) is distinct from 'service_role'/);
assert.match(partnerBindingMigration, /for update/);
assert.match(partnerBindingMigration, /grant execute on function public\.bind_verified_partner_attribution_v1/);
assert.match(source, /domain: partnerAppHost/);
assert.match(source, /verification_status: "verified"/);
assert.match(source, /ssl_status: "active"/);
assert.match(source, /verify exact active verified staging partner domain/);
assert.match(source, /verify exact white-label child workspace attribution/);
assert.match(source, /scenario: "durable_retry_pending"/);
assert.match(source, /scenario: "durable_operator_failure"/);
assert.match(source, /next_run_at: "2099-01-01T00:00:00\.000Z"/);
assert.match(source, /provider_actions_allowed: false/);
assert.match(source, /contains_customer_data: false/);
assert.match(source, /\[IDS\.retryJob, "pending", "durable retry"\]/);
assert.match(source, /\[IDS\.deadLetterJob, "failed", "durable operator failure"\]/);
assert.match(source, /`verify exact synthetic \$\{label\} fixture`/);
assert.match(source, /failureFixtures:/);
assert.match(envExample, /^QA_EMAIL=dealflow-staging-20260712@example\.com$/m);
assert.match(envExample, /^STAGING_QA_PASSWORD=$/m);
assert.match(envExample, /^PARTNER_ATTRIBUTION_SIGNING_SECRET=$/m);

console.log(
  "isolated staging seed contract: PASS (pinned project/app/auth identity, seven deterministic synthetic roles, paid/unpaid/legacy truth, verified white-label domain/branding/attribution, durable retry/failure fixtures, canonical Meta launch truth, zero provider credentials/writes, exact $297 activation, exact-once $10 credit, and exact counts)",
);
