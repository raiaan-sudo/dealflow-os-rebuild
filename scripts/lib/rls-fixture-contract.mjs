export const RLS_FIXTURE_AUTH_EMAIL_PREFIX = "rls-fixture-";

export const RLS_FIXTURE_DIRECT_MARKERS = Object.freeze([
  Object.freeze({
    key: "users",
    table: "users",
    column: "email",
    operator: "like",
    value: "rls-fixture-%",
    fixtureKey: "userIds",
  }),
  Object.freeze({
    key: "organizations",
    table: "organizations",
    column: "slug",
    operator: "like",
    value: "rls-fixture-%",
    fixtureKey: "orgIds",
  }),
  Object.freeze({
    key: "campaigns",
    table: "campaign_plans",
    column: "public_slug",
    operator: "like",
    value: "rls-fixture-%",
    fixtureKey: "campaignIds",
  }),
  Object.freeze({
    key: "leads",
    table: "leads",
    column: "source",
    operator: "eq",
    value: "rls_fixture",
    fixtureKey: "leadIds",
  }),
  Object.freeze({
    key: "leadMessages",
    table: "lead_messages",
    column: "provider_message_id",
    operator: "like",
    value: "rls-fixture-message-%",
    fixtureKey: "leadMessageIds",
  }),
  Object.freeze({
    key: "marketingAccounts",
    table: "marketing_accounts",
    column: "external_account_id",
    operator: "like",
    value: "act_rls_%",
    fixtureKey: "marketingAccountIds",
  }),
  Object.freeze({
    key: "creativeAssets",
    table: "creative_assets",
    column: "creative_id",
    operator: "like",
    value: "rls-creative-%",
    fixtureKey: "creativeAssetIds",
  }),
  Object.freeze({
    key: "billingSubscriptions",
    table: "billing_subscriptions",
    column: "stripe_customer_id",
    operator: "like",
    value: "cus_rls_%",
    fixtureKey: "billingIds",
  }),
  Object.freeze({
    key: "systemJobs",
    table: "system_jobs",
    column: "kind",
    operator: "eq",
    value: "rls_fixture",
    fixtureKey: "jobIds",
  }),
  Object.freeze({
    key: "metaLaunchLocks",
    table: "meta_launch_locks",
    column: "locked_by",
    operator: "eq",
    value: "rls-fixture",
    fixtureKey: null,
  }),
]);

export const RLS_FIXTURE_LEGACY_IMMUTABLE_MARKERS = Object.freeze([
  Object.freeze({
    key: "legacyStripeWebhookEvents",
    table: "stripe_webhook_events",
    column: "stripe_event_id",
    operator: "like",
    value: "evt_rls_%",
    fixtureKey: null,
  }),
  Object.freeze({
    key: "legacyProviderUsageLimits",
    table: "provider_usage_limits",
    column: "provider",
    operator: "eq",
    value: "fixture",
    secondary: Object.freeze({ column: "operation", operator: "like", value: "rls-%" }),
    fixtureKey: null,
  }),
  Object.freeze({
    key: "legacyProviderUsageEvents",
    table: "provider_usage_events",
    column: "provider",
    operator: "eq",
    value: "fixture",
    secondary: Object.freeze({ column: "operation", operator: "like", value: "rls-%" }),
    fixtureKey: null,
  }),
]);

export function applyRlsFixtureMarker(query, marker) {
  let filtered;
  if (marker.operator === "eq") filtered = query.eq(marker.column, marker.value);
  else if (marker.operator === "like") filtered = query.like(marker.column, marker.value);
  else throw new Error(`Unsupported RLS fixture marker operator: ${marker.operator}`);
  if (!marker.secondary) return filtered;
  if (marker.secondary.operator === "eq") {
    return filtered.eq(marker.secondary.column, marker.secondary.value);
  }
  if (marker.secondary.operator === "like") {
    return filtered.like(marker.secondary.column, marker.secondary.value);
  }
  throw new Error(`Unsupported RLS fixture marker operator: ${marker.secondary.operator}`);
}

export function isRlsFixtureAuthEmail(email) {
  return typeof email === "string" && email.toLowerCase().startsWith(RLS_FIXTURE_AUTH_EMAIL_PREFIX);
}
