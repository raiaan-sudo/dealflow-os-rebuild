#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildStagingMetaProviderContract } from "./lib/staging-meta-provider-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "scripts", "seed-isolated-staging.mjs"), "utf8");
const successorContract = readFileSync(
  join(root, "scripts", "staging", "successor-provider-independent-contract.mjs"),
  "utf8",
);
const authorityReset = readFileSync(
  join(root, "scripts", "lib", "synthetic-qa-authority-reset.mjs"),
  "utf8",
);
const envExample = readFileSync(join(root, ".env.example"), "utf8");
const activationMigration = readFileSync(
  join(root, "supabase", "migrations", "20260713012000_require_meta_activation_preauthorization.sql"),
  "utf8",
);
const partnerBindingMigration = readFileSync(
  join(root, "supabase", "migrations", "20260713015000_bind_verified_partner_attribution_atomically.sql"),
  "utf8",
);
const ghlActivationMigration = readFileSync(
  join(
    root,
    "supabase",
    "migrations",
    "20260712223000_complete_ghl_activation_and_lifecycle_foundation.sql",
  ),
  "utf8",
);
const campaignEntitlementMigration = readFileSync(
  join(
    root,
    "supabase",
    "migrations",
    "20260713021000_require_paid_activation_for_campaign_creation.sql",
  ),
  "utf8",
);
const campaignCreationGateMigration = readFileSync(
  join(
    root,
    "supabase",
    "migrations",
    "20260710235950_gate_campaign_creation_entitlement.sql",
  ),
  "utf8",
);
const optimizerMinimumSampleMigration = readFileSync(
  join(
    root,
    "supabase",
    "migrations",
    "20260716010000_require_optimizer_cpl_minimum_lead_sample.sql",
  ),
  "utf8",
);
const creditTopUpV2Migration = readFileSync(
  join(
    root,
    "supabase",
    "migrations",
    "20260716180000_harden_credit_top_up_request_idempotency.sql",
  ),
  "utf8",
);
const ghlMarketplaceMigration = readFileSync(
  join(
    root,
    "supabase",
    "migrations",
    "20260716190000_add_ghl_marketplace_oauth_install_foundation.sql",
  ),
  "utf8",
);
const stripeLifecycleMigration = readFileSync(
  join(
    root,
    "supabase",
    "migrations",
    "20260716200000_harden_stripe_payment_lifecycle.sql",
  ),
  "utf8",
);

assert.match(source, /FIXTURE_LABEL = "DF-STAGING-20260712"/);
assert.match(source, /FIXTURE_TIMESTAMP = "2026-07-12T12:00:00\.000Z"/);
assert.match(source, /PAID_DIRECT_EMAIL = "dealflow-staging-20260712@example\.com"/);
assert.match(source, /EXPECTED_QA_EMAIL = "dealflow-staging-qa-harness-20260712@example\.com"/);
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
  "active_white_label_partner_two_admin",
  "white_label_partner_two_child_realtor",
  "internal_admin_operator",
  "cross_tenant_attacker",
  "account_deletion_fail_closed_realtor",
  "non_admin_qa_harness",
]) {
  assert.match(source, new RegExp(`key: "${scenario}"`), `missing ${scenario} fixture`);
}
assert.match(source, /EXPECTED_SYNTHETIC_AUTH_EMAILS/);
assert.match(source, /ensureSyntheticAuthUser/);
assert.match(source, /scenario: scenario\.key/);
assert.match(source, /PAID_DIRECT_ORGANIZATION_MEMBERSHIP_ROLE = "owner"/);
assert.match(source, /function isExactOrganizationMembership\(actual, expected\)/);
assert.match(source, /async function ensureExactOrganizationMembership\(admin, expected\)/);
assert.match(source, /\.select\("id,organization_id,user_id,role"\)/);
assert.match(source, /if \(isExactOrganizationMembership\(existing, expected\)\) return existing/);
assert.match(source, /The synthetic organization membership was not persisted exactly/);
assert.equal(
  (source.match(/ensureExactOrganizationMembership\(admin, \{/g) ?? []).length,
  3,
  "paid owner, QA member, and scenario membership writes must be replay-safe",
);
assert.match(source, /role: PAID_DIRECT_ORGANIZATION_MEMBERSHIP_ROLE/);
assert.match(source, /paidDirectOrganization\.owner_user_id !== userId/);
assert.match(source, /paidDirectMembership\.organization_id !== IDS\.organization/);
assert.match(source, /paidDirectMembership\.user_id !== userId/);
assert.match(source, /paidDirectMembership\.role !== PAID_DIRECT_ORGANIZATION_MEMBERSHIP_ROLE/);
assert.match(source, /paid direct staging identity is not the exact workspace owner/i);
assert.match(source, /role: "member"/);
assert.match(source, /QA harness staging identity is not the exact non-admin Pro member/);
assert.match(source, /verify exact synthetic non-admin QA harness membership/);
assert.match(source, /qaHarnessAuthUser/);
assert.match(source, /function createSyntheticQaAuthorityStore\(admin, qaHarnessUserId\)/);
assert.match(authorityReset, /export async function resetSyntheticQaHarnessAuthority\(\{/);
assert.match(authorityReset, /MAX_SYNTHETIC_QA_AUTHORITY_ROWS = 100/);
assert.match(authorityReset, /Discover and validate every cleanup class before the first mutation/);
assert.match(authorityReset, /fixedOrganizationIds\.has\(id\)/);
assert.match(source, /discover synthetic QA-owned organizations/);
assert.match(source, /remove exact synthetic QA-owned organizations/);
assert.match(source, /remove exact synthetic QA organization memberships/);
assert.match(source, /remove exact synthetic QA partner memberships/);
assert.equal(
  source.match(/\.in\("id", expectedIds\)/g)?.length,
  3,
  "Each synthetic QA authority cleanup delete must be bound to the exact prevalidated row IDs",
);
assert.equal(
  source.match(/\.limit\(safetyLimit\)/g)?.length,
  3,
  "Each synthetic QA authority preflight/readback query must use the bounded safety limit",
);
assert.match(authorityReset, /did not reach zero elevation/);
assert.match(source, /qaHarnessAuthorityResetPolicyApplied/);
assert.match(source, /authorityResetPolicyApplied: qaHarnessAuthorityResetPolicyApplied/);
assert.match(source, /read back exact non-admin QA harness profile/);
assert.match(source, /read back all non-admin QA harness organization memberships/);
assert.match(source, /read back all non-admin QA harness partner memberships/);
assert.match(source, /read back non-admin QA harness organization ownership/);
assert.match(source, /qaHarnessOrganizationMemberships\.length === 1/);
assert.match(source, /qaHarnessProfileTruth\.partner_id == null/);
assert.match(source, /isExactOrganizationMembership\(qaHarnessOrganizationMemberships\[0\], \{/);
assert.match(source, /qaHarnessPartnerMemberships\.length === 0/);
assert.match(source, /partnerMembershipCount: qaHarnessPartnerMemberships\.length/);
assert.match(source, /qaHarnessOwnedOrganizations\.length === 0/);
assert.match(source, /profilePartnerId: qaHarnessProfileTruth\.partner_id/);
assert.match(source, /elevated: !qaHarnessNonElevated/);
assert.match(source, /verify exact synthetic paid-direct owner membership/);
assert.match(
  ghlActivationMigration,
  /organization_record\.owner_user_id is distinct from p_user_id[\s\S]*role in \('owner', 'admin'\)/,
);
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
assert.match(source, /provider_contract: buildStagingMetaProviderContract\(\{/);
assert.match(source, /objective: "OUTCOME_LEADS"/);
assert.match(source, /countryCode: "CA"/);
assert.match(source, /dailyBudgetMinor: String\(META_FIXTURE\.dailyBudgetCents\)/);
assert.match(source, /adDestination: META_FIXTURE\.adDestination/);
assert.match(source, /pageId: META_FIXTURE\.providerPageId/);
const providerContractInput = Object.freeze({
  objective: "OUTCOME_LEADS",
  countryCode: "CA",
  dailyBudgetMinor: "1000",
  adDestination: "meta_instant_form",
  pageId: "900000000000002",
});
assert.deepEqual(buildStagingMetaProviderContract(providerContractInput), {
  campaign: {
    objective: "OUTCOME_LEADS",
    special_ad_categories: ["HOUSING"],
    special_ad_category_country: ["CA"],
    is_adset_budget_sharing_enabled: false,
  },
  ad_set: {
    billing_event: "IMPRESSIONS",
    optimization_goal: "LEAD_GENERATION",
    daily_budget_minor: "1000",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: { geo_locations: { countries: ["CA"] } },
    destination_type: "ON_AD",
    promoted_object: { page_id: "900000000000002" },
    tracking_specs: [],
  },
  creative: {
    page_id: "900000000000002",
    call_to_action_type: "LEARN_MORE",
    link: "https://fb.me/",
    cta_link: null,
    provider_form_binding: "provisioning_receipt",
  },
});
for (const key of Object.keys(providerContractInput)) {
  assert.throws(
    () => buildStagingMetaProviderContract({ ...providerContractInput, [key]: undefined }),
    /isolated staging Meta provider contract|must be meta_instant_form/,
    `missing ${key} must fail closed`,
  );
}
for (const [key, value] of [
  ["objective", "LEADS"],
  ["countryCode", "Canada"],
  ["dailyBudgetMinor", "0"],
  ["dailyBudgetMinor", "10.00"],
  ["adDestination", "website"],
  ["pageId", "page-not-numeric"],
]) {
  assert.throws(
    () => buildStagingMetaProviderContract({ ...providerContractInput, [key]: value }),
    /isolated staging Meta provider contract|must be meta_instant_form/,
    `invalid ${key} must fail closed`,
  );
}
assert.equal(Object.isFrozen(buildStagingMetaProviderContract(providerContractInput)), true);
assert.match(
  activationMigration,
  /p_launch_approval_snapshot -> 'provider_contract' -> 'campaign'/,
);
assert.match(
  activationMigration,
  /p_launch_approval_snapshot -> 'provider_contract' -> 'ad_set'/,
);
assert.match(
  activationMigration,
  /p_launch_approval_snapshot -> 'provider_contract' -> 'creative'/,
);
assert.match(source, /provider_contract\?\.campaign\?\.objective !== "OUTCOME_LEADS"/);
assert.match(source, /provider_contract\?\.ad_set\?\.optimization_goal !== "LEAD_GENERATION"/);
assert.match(source, /provider_contract\?\.creative\?\.provider_form_binding !== "provisioning_receipt"/);
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
assert.match(source, /const rlsCreditInput = \{/);
assert.match(source, /p_reason: "isolated_staging_rls_fixture"/);
assert.match(source, /p_idempotency_key: `isolated_staging_rls_credit:\$\{IDS\.attackerOrganization\}`/);
assert.match(source, /admin\.rpc\("grant_user_credits", rlsCreditInput\)/);
assert.match(source, /rlsCreditReplay\?\.reused_existing !== true/);
assert.match(source, /\.from\("organization_user_credits"\)/);
assert.match(source, /rlsCreditFixtures: \{/);
assert.match(source, /userAId: userId/);
assert.match(source, /userBId: scenarioUserIds\.attacker/);
assert.match(source, /ledgerAId: initialCreditTruth\.id/);
assert.match(source, /ledgerBId: rlsCreditTruth\.id/);
assert.match(source, /billingAId: IDS\.billing/);
assert.match(source, /stripeEventAId: rlsStripeA\.id/);
assert.match(source, /stripeEventBId: rlsStripeB\.id/);
assert.match(source, /providerUsageLimitAId: rlsProviderA\.limitId/);
assert.match(source, /providerUsageLimitBId: rlsProviderB\.limitId/);
assert.match(source, /providerUsageEventAId: rlsProviderA\.eventId/);
assert.match(source, /providerUsageEventBId: rlsProviderB\.eventId/);
assert.match(source, /balanceA: rlsCreditBalanceA\.balance/);
assert.match(source, /balanceB: rlsCreditBalanceB\.balance/);
assert.match(source, /claim_stripe_webhook_event_v2/);
assert.match(source, /settle_stripe_webhook_event_v2/);
assert.match(source, /reserve_provider_usage_attempt_v2/);
assert.match(source, /settle_provider_usage_attempt_v2/);
assert.match(source, /prove terminal settlement replay for synthetic provider RLS receipt/);
assert.match(source, /terminalReplay\.reused_terminal !== true/);
assert.match(source, /p_credit_amount: 0/);
assert.match(source, /discover canonical provider RLS receipt/);
assert.match(source, /\.eq\("idempotency_key", idempotencyKey\)/);
assert.match(source, /\.eq\("usage_date", eventTruth\.usage_date\)/);
assert.doesNotMatch(
  source,
  /isolated-staging-rls-provider:\$\{organizationId\}:\$\{usageDate\}/,
  "canonical append-only provider fixtures must not accumulate a new row on a future-day seed replay",
);
assert.match(source, /providerMutationPerformed: false/);
assert.match(source, /The live synthetic RLS credit balances are not exactly scoped/);
assert.match(source, /replayIdempotent: true/);
assert.match(source, /request_ghl_provisioning_from_billing_activation_v1/);
assert.match(source, /proveSyntheticCreditAndPendingStripeLifecycle/);
assert.match(source, /assertSuccessorServiceOnlySchemaReadback/);
assert.match(source, /DEALFLOW_GHL_EMBED_AUTH_EXCHANGE_PREFLIGHT_COUNT/);
assert.match(source, /preflightGhlEmbedAuthExchangeCount/);
assert.match(source, /direct PostgreSQL GHL embed auth-exchange preflight count must be zero/);
assert.match(source, /successorCreditIntent: "e3000000-0000-4000-8000-000000000001"/);
assert.match(source, /successorCreditReplayIntent: "e3000000-0000-4000-8000-000000000002"/);
assert.match(source, /successorCreditRequest: "e3000000-0000-4000-8000-000000000003"/);
assert.match(source, /checkoutSessionId: "cs_test_df_successor_credit_pending_20260716"/);
assert.match(source, /successorProviderIndependent: \{/);
assert.match(source, /exactMigrationChainRequired: 123/);
assert.match(source, /20260722020000_persist_ghl_location_token_scope\.sql/);
assert.match(successorContract, /SUCCESSOR_SCHEMA_VERSION = "20260720010000"/);
for (const table of [
  "ghl_marketplace_oauth_states",
  "ghl_marketplace_authorities",
  "ghl_marketplace_lifecycle_events",
  "ghl_marketplace_token_sets",
  "ghl_marketplace_token_events",
  "ghl_marketplace_location_token_exchanges",
  "ghl_marketplace_realtor_user_operations",
  "stripe_checkout_payment_lifecycle",
  "stripe_charge_financial_lifecycle",
  "stripe_refund_lifecycle",
  "stripe_dispute_lifecycle",
  "account_deletion_resource_manifest",
  "account_deletion_tombstones",
  "support_delivery_lifecycle_events",
  "support_delivery_lifecycle_state",
  "ghl_funnel_publications",
  "ghl_funnel_publication_receipts",
  "ghl_embed_auth_exchanges",
]) {
  assert.match(successorContract, new RegExp(`"${table}"`), `missing successor table ${table}`);
}
assert.match(successorContract, /create_credit_top_up_intent_v2/);
assert.match(successorContract, /bind_credit_top_up_checkout_v1/);
assert.match(successorContract, /project_stripe_checkout_payment_lifecycle_v1/);
assert.match(successorContract, /pendingPaymentCreditLedgerRows: 0/);
assert.match(successorContract, /result\.error\.code !== "42501"/);
assert.match(successorContract, /authenticatedDenialCount: authenticatedDenials\.length/);
assert.match(successorContract, /SERVICE_ROLE_DIRECT_READ_DENIED_TABLES/);
assert.match(successorContract, /assertServiceRoleDirectTableDenied/);
assert.match(successorContract, /serviceRoleDirectDenialCount: serviceRoleDirectDenials\.length/);
assert.match(successorContract, /ghlEmbedAuthExchangeCountSource: "direct_postgres_preseed_read_only"/);
assert.match(successorContract, /BLOCKED_PROVIDER_INDEPENDENT_ACTIVE_META_RECEIPT_REQUIRED/);
assert.match(successorContract, /BLOCKED_EXTERNAL_GHL_SANDBOX_AUTHORITY/);
assert.match(successorContract, /BLOCKED_EXTERNAL_STRIPE_TEST_AUTHORITY/);
assert.match(
  optimizerMinimumSampleMigration,
  /meta_optimizer_cpl_minimum_lead_sample_guard[\s\S]*before insert on public\.meta_optimization_execution_intents/,
);
assert.match(optimizerMinimumSampleMigration, /message = 'below_minimum_leads_for_cpl'/);
assert.match(creditTopUpV2Migration, /credit_top_up_intents_actor_request_unique/);
assert.match(creditTopUpV2Migration, /credit_top_up_request_identity_collision/);
assert.match(creditTopUpV2Migration, /to service_role/);
assert.match(ghlMarketplaceMigration, /force row level security/);
assert.match(ghlMarketplaceMigration, /grant select on table public\.%I to service_role/);
assert.match(ghlMarketplaceMigration, /return 'duplicate'/);
assert.match(ghlMarketplaceMigration, /return query select 'stale_generation'/);
assert.match(ghlMarketplaceMigration, /generation = next_generation/);
assert.match(ghlMarketplaceMigration, /on conflict \(idempotency_key\)/);
assert.match(ghlMarketplaceMigration, /ghl_marketplace_receipt_is_append_only/);
assert.match(ghlMarketplaceMigration, /Only opaque encrypted references are stored/);
assert.match(stripeLifecycleMigration, /force row level security/);
assert.match(stripeLifecycleMigration, /to service_role/);
assert.match(stripeLifecycleMigration, /stripe_checkout_lifecycle_identity_collision/);
assert.match(stripeLifecycleMigration, /p_event_created > current_record\.latest_event_created/);
assert.match(stripeLifecycleMigration, /current_record\.payment_state <> 'succeeded'/);
assert.match(stripeLifecycleMigration, /status = 'operator_action_required'/);
assert.doesNotMatch(source, /upsert\(admin, "campaign_plans"/);
assert.match(source, /create \$\{childCampaign\.name\} through entitlement RPC/);
assert.match(source, /p_campaign_id: childCampaign\.id/);
assert.match(source, /p_organization_id: childCampaign\.organizationId/);
assert.match(source, /p_user_id: childCampaign\.userId/);
assert.match(source, /\.eq\("id", childCampaign\.id\)[\s\S]*\.eq\("organization_id", childCampaign\.organizationId\)[\s\S]*\.eq\("user_id", childCampaign\.userId\)/);
assert.match(source, /completedChildCampaign\.partner_id !== childCampaign\.partnerId/);
const childCampaignUpdateBody = /const completedChildCampaign = await assertNoError\(\s*await admin\s*\.from\("campaign_plans"\)\s*\.update\(\{([\s\S]*?)\}\)\s*\.eq\("id", childCampaign\.id\)/.exec(source)?.[1];
assert.ok(childCampaignUpdateBody, "child campaign completion update must remain statically inspectable");
assert.doesNotMatch(
  childCampaignUpdateBody,
  /\b(?:id|owner_id|organization_id|user_id)\s*:/,
  "child campaign completion must not mutate immutable tenant identity",
);
assert.match(
  campaignCreationGateMigration,
  /revoke insert on table public\.campaign_plans from public, anon, authenticated, service_role/,
);
assert.match(
  campaignEntitlementMigration,
  /grant execute on function public\.create_campaign_plan_with_entitlement_v1[\s\S]*to service_role/,
);
assert.match(campaignEntitlementMigration, /Exact tenant\/user identity replay is read-only/);
assert.match(
  source,
  /must be installed by the pinned DB-owner broker before fixture seeding/,
  "the service-role seed must never install owner\/legal retention authority",
);
assert.doesNotMatch(
  source,
  /\.from\("account_deletion_retention_configuration"\)\s*\.update\(/,
  "the service-role seed must remain read-only for retention authority",
);
assert.doesNotMatch(source, /install exact synthetic staging retention authority/);
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
assert.match(source, /brandName: `\$\{FIXTURE_LABEL\} Partner Realty OS`/);
assert.match(source, /productName: `\$\{FIXTURE_LABEL\} Partner Realty OS`/);
assert.match(source, /brandName: `\$\{FIXTURE_LABEL\} Partner Two Realty OS`/);
assert.match(source, /productName: `\$\{FIXTURE_LABEL\} Partner Two Realty OS`/);
assert.match(source, /upsert\(admin, "partner_domains"/);
assert.doesNotMatch(source, /upsert\(admin, "workspace_partner_attribution"/);
assert.match(source, /admin\.rpc\("bind_verified_partner_attribution_v1"/);
assert.match(source, /scenarioName !== "partnerChild"/);
assert.match(source, /scenarioName !== "partnerAdmin"/);
assert.match(source, /scenarioName !== "partnerChildTwo"/);
assert.match(source, /scenarioName !== "partnerAdminTwo"/);
assert.doesNotMatch(source, /const partnerId = \["partnerAdmin", "partnerChild"\]/);
assert.match(source, /p_user_id: scenarioUserIds\.partnerChild/);
assert.match(source, /p_organization_id: IDS\.partnerChildOrganization/);
assert.match(source, /p_verified_domain: partnerAppHost/);
assert.match(source, /\["bound", "already_bound"\]/);
assert.match(source, /attributionBoundAtomically: true/);
assert.match(source, /p_user_id: scenarioUserIds\.partnerChildTwo/);
assert.match(source, /p_organization_id: IDS\.partnerChildTwoOrganization/);
assert.match(source, /p_verified_domain: partnerTwoAppHost/);
assert.match(source, /partnerTwo:/);
assert.match(source, /configuredPartnerCount|Partner Two Child Campaign/);
assert.match(partnerBindingMigration, /create or replace function public\.bind_verified_partner_attribution_v1/);
assert.match(partnerBindingMigration, /auth\.role\(\) is distinct from 'service_role'/);
assert.match(partnerBindingMigration, /for update/);
assert.match(partnerBindingMigration, /grant execute on function public\.bind_verified_partner_attribution_v1/);
assert.match(source, /domain: partnerAppHost/);
assert.match(source, /verification_status: "verified"/);
assert.match(source, /ssl_status: "active"/);
assert.match(source, /verify exact active verified staging partner domain/);
assert.match(source, /verify exact white-label child workspace attribution/);
assert.match(source, /verify exact white-label partner two child workspace attribution/);
assert.match(source, /const publishedCampaignSnapshot = \{/);
assert.match(source, /staged_snapshot: publishedCampaignSnapshot/);
assert.match(source, /published_snapshot: publishedCampaignSnapshot/);
assert.match(source, /publishedFunnelTruth\.published_snapshot\?\.funnel\?\.cta !== "Learn More"/);
assert.match(source, /publishedFunnelTruth\.published_snapshot\?\.plan\?\.public_slug !== publicSlug/);
assert.match(source, /The synthetic staging published funnel snapshot is incomplete or drifted/);
assert.match(source, /read back exact synthetic \$\{label\} branding/);
assert.match(source, /The synthetic staging \$\{label\} branding schema is incomplete or drifted/);
assert.match(source, /SYNTHETIC_RETENTION_AUTHORITY_MARKER/);
assert.match(source, /const SYNTHETIC_RETENTION_POLICY = Object\.freeze/);
assert.match(source, /grace_days: 0/);
assert.match(source, /operational_retention_days: 1/);
assert.match(source, /financial_retention_days: 365/);
assert.match(source, /billing_cancellation_mode: "period_end"/);
assert.match(source, /policy_version: 2/);
assert.match(source, /The staging retention policy drifted at/);
assert.match(source, /The staging retention policy readback drifted at/);
assert.match(source, /policy: SYNTHETIC_RETENTION_POLICY/);
assert.match(source, /pinned DB-owner broker before fixture seeding/);
assert.match(source, /pendingBeforeApproval: retentionAuthorityPendingBeforeApproval/);
assert.match(source, /approvedAt: new Date\(retentionAuthorityAfter\.approved_at\)\.toISOString\(\)/);
assert.match(source, /reusedExistingSyntheticApproval: syntheticRetentionAuthorityReused/);
assert.match(source, /freshReportingSnapshot/);
assert.match(source, /staleReportingSnapshot/);
assert.match(source, /failedReportingAttemptSnapshot/);
assert.match(source, /scenario: "durable_retry_pending"/);
assert.match(source, /scenario: "durable_operator_failure"/);
assert.match(source, /reviewed_by: `\$\{FIXTURE_LABEL\}:synthetic-acceptance`/);
assert.match(source, /Reviewed synthetic dead-letter fixture retained only to prove terminal worker semantics/);
assert.match(source, /next_run_at: "2099-01-01T00:00:00\.000Z"/);
assert.match(source, /provider_actions_allowed: false/);
assert.match(source, /contains_customer_data: false/);
assert.match(source, /\[IDS\.retryJob, "pending", "durable retry"\]/);
assert.match(source, /\[IDS\.deadLetterJob, "failed", "durable operator failure"\]/);
assert.match(source, /\[IDS\.workerPendingJob, "pending", "pending worker completion"\]/);
assert.match(source, /\[IDS\.workerCrashJob, "processing", "expired worker crash"\]/);
assert.match(source, /`verify exact synthetic \$\{label\} fixture`/);
assert.match(source, /failureFixtures:/);
assert.match(envExample, /^QA_EMAIL=dealflow-staging-qa-harness-20260712@example\.com$/m);
assert.match(envExample, /^STAGING_QA_PASSWORD=$/m);
assert.match(envExample, /^PARTNER_ATTRIBUTION_SIGNING_SECRET=$/m);
assert.match(envExample, /^STAGING_SECOND_PARTNER_APP_URL=$/m);

console.log(
  "isolated staging seed contract: PASS (pinned project/app/auth identity, ten deterministic business roles plus one non-admin QA harness member, two isolated white-label partners and child tenants, fresh/stale/failed reporting truth, DB-owner-installed exact synthetic deletion authority and policy, durable retry/crash/dead-letter fixtures, canonical Meta launch truth, immutable 105-120 predecessor plus bounded 121 SSO authority, zero provider credentials/writes, exact $297 activation, exact-once $10 credit, and exact counts)",
);
