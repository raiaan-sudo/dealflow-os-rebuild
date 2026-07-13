#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const FIXTURE_LABEL = "DF-STAGING-20260712";
const FIXTURE_TIMESTAMP = "2026-07-12T12:00:00.000Z";
const EXPECTED_QA_EMAIL = "dealflow-staging-20260712@example.com";
const EXPECTED_STAGING_PROJECT_FINGERPRINT =
  "c4d7f6ba9f2c678101b45b453998c4fa5755d8ec038f6cfd3ca8de957a0d1f4c";
const EXPECTED_STAGING_SAFE_SUFFIX = "qibh";
const EXPECTED_STAGING_APP_HOST = "dealflow-os-rebuild-selfserve-clean.vercel.app";
const SYNTHETIC_SCENARIOS = Object.freeze({
  newDirect: Object.freeze({
    key: "new_unpaid_direct_realtor",
    email: "dealflow-staging-new-direct-20260712@example.com",
    fullName: `${FIXTURE_LABEL} New Direct Realtor`,
  }),
  paidDirect: Object.freeze({
    key: "paid_direct_realtor",
    email: EXPECTED_QA_EMAIL,
    fullName: `${FIXTURE_LABEL} Paid Direct Realtor`,
  }),
  legacy: Object.freeze({
    key: "grandfathered_legacy_realtor",
    email: "dealflow-staging-legacy-20260712@example.com",
    fullName: `${FIXTURE_LABEL} Legacy Realtor`,
  }),
  partnerAdmin: Object.freeze({
    key: "active_white_label_partner_admin",
    email: "dealflow-staging-partner-admin-20260712@example.com",
    fullName: `${FIXTURE_LABEL} Partner Admin`,
  }),
  partnerChild: Object.freeze({
    key: "white_label_child_realtor",
    email: "dealflow-staging-partner-child-20260712@example.com",
    fullName: `${FIXTURE_LABEL} Partner Child Realtor`,
  }),
  operator: Object.freeze({
    key: "internal_admin_operator",
    email: "dealflow-staging-operator-20260712@example.com",
    fullName: `${FIXTURE_LABEL} Internal Operator`,
  }),
  attacker: Object.freeze({
    key: "cross_tenant_attacker",
    email: "dealflow-staging-attacker-20260712@example.com",
    fullName: `${FIXTURE_LABEL} Cross Tenant Attacker`,
  }),
});
const EXPECTED_SYNTHETIC_AUTH_EMAILS = Object.freeze(
  Object.values(SYNTHETIC_SCENARIOS).map((scenario) => scenario.email).sort(),
);
const META_FIXTURE = Object.freeze({
  providerAdAccountId: "900000000000001",
  externalAdAccountId: "act_900000000000001",
  providerPageId: "900000000000002",
  providerPixelId: "900000000000003",
  currency: "CAD",
  selectedAdId: "df-staging-static-20260712",
  dailyBudgetCents: 1_000,
  adDestination: "meta_instant_form",
});
const LAUNCH_TIME_ZONE = "America/New_York";
const IDS = Object.freeze({
  organization: "d1000000-0000-4000-8000-000000000001",
  membership: "d1000000-0000-4000-8000-000000000002",
  newOrganization: "d1000000-0000-4000-8000-000000000003",
  newMembership: "d1000000-0000-4000-8000-000000000004",
  legacyOrganization: "d1000000-0000-4000-8000-000000000005",
  legacyMembership: "d1000000-0000-4000-8000-000000000006",
  partnerChildOrganization: "d1000000-0000-4000-8000-000000000007",
  partnerChildMembership: "d1000000-0000-4000-8000-000000000008",
  operatorOrganization: "d1000000-0000-4000-8000-000000000009",
  operatorMembership: "d1000000-0000-4000-8000-000000000010",
  attackerOrganization: "d1000000-0000-4000-8000-000000000011",
  attackerMembership: "d1000000-0000-4000-8000-000000000012",
  partnerAdminOrganization: "d1000000-0000-4000-8000-000000000013",
  partnerAdminOrganizationMembership: "d1000000-0000-4000-8000-000000000014",
  campaign: "d2000000-0000-4000-8000-000000000001",
  lead: "d3000000-0000-4000-8000-000000000001",
  leadMessage: "d3000000-0000-4000-8000-000000000002",
  marketingAccount: "d4000000-0000-4000-8000-000000000001",
  creativeAsset: "d5000000-0000-4000-8000-000000000001",
  billing: "d6000000-0000-4000-8000-000000000001",
  legacyBilling: "d6000000-0000-4000-8000-000000000002",
  partner: "d7000000-0000-4000-8000-000000000001",
  partnerMembership: "d7000000-0000-4000-8000-000000000002",
  partnerBranding: "d7000000-0000-4000-8000-000000000003",
  partnerDomain: "d7000000-0000-4000-8000-000000000004",
  retryJob: "d8000000-0000-4000-8000-000000000001",
  deadLetterJob: "d8000000-0000-4000-8000-000000000002",
});

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function projectRef(rawUrl) {
  const url = new URL(rawUrl);
  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) return "local";
  const match = /^([a-z0-9-]+)\.supabase\.co$/.exec(url.hostname.toLowerCase());
  return match?.[1] ?? null;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sameInstant(left, right) {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function assertStagingAppUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.hostname !== EXPECTED_STAGING_APP_HOST) {
    throw new Error("NEXT_PUBLIC_APP_URL must match the exact isolated staging application host");
  }
  return url.origin;
}

function assertStagingPartnerAppUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname === EXPECTED_STAGING_APP_HOST ||
    !url.hostname.endsWith(".vercel.app") ||
    !url.hostname.startsWith("dealflow-os-rebuild-selfserve-clean-") ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "STAGING_PARTNER_APP_URL must be a distinct deployment-bound Vercel staging URL",
    );
  }
  return url.origin;
}

function getZonedParts(date, timeZone) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function zonedDateTimeToUtc(parts, timeZone) {
  const target = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = getZonedParts(new Date(guess), timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const delta = target - observedAsUtc;
    guess += delta;
    if (delta === 0) break;
  }
  return new Date(guess);
}

function getNextEligibleLaunchAt(now) {
  const localNow = getZonedParts(now, LAUNCH_TIME_ZONE);
  const launchToday = zonedDateTimeToUtc({
    ...localNow,
    hour: 9,
    minute: 0,
    second: 0,
  }, LAUNCH_TIME_ZONE);
  if (now.getTime() <= launchToday.getTime()) return launchToday;
  const tomorrowDate = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + 1));
  return zonedDateTimeToUtc({
    year: tomorrowDate.getUTCFullYear(),
    month: tomorrowDate.getUTCMonth() + 1,
    day: tomorrowDate.getUTCDate(),
    hour: 9,
    minute: 0,
    second: 0,
  }, LAUNCH_TIME_ZONE);
}

function assertIsolatedStaging(url) {
  if (!["staging", "preview", "test"].includes(process.env.DEALFLOW_DEPLOYMENT_TARGET ?? "")) {
    throw new Error("An explicit nonproduction DealFlow deployment target is required");
  }
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("The staging fixture seeder is disabled in Vercel production");
  }
  const actual = projectRef(url);
  if (
    !actual ||
    actual.slice(-4) !== EXPECTED_STAGING_SAFE_SUFFIX ||
    sha256(actual) !== EXPECTED_STAGING_PROJECT_FINGERPRINT
  ) {
    throw new Error("The Supabase project does not match the exact staging attestation");
  }
  return actual;
}

async function assertNoError(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function listAuthUsers(admin) {
  const users = [];
  for (let page = 1; page <= 5; page += 1) {
    const data = await assertNoError(
      await admin.auth.admin.listUsers({ page, perPage: 200 }),
      "list staging auth users",
    );
    users.push(...data.users);
    if (data.users.length < 200) return users;
  }
  throw new Error("The staging auth-user search exceeded its bounded page limit");
}

function assertSyntheticAuthUser(user, scenario) {
  return (
    user?.email?.toLowerCase() === scenario.email &&
    user?.user_metadata?.fixture === FIXTURE_LABEL &&
    user?.user_metadata?.synthetic === true &&
    user?.user_metadata?.scenario === scenario.key
  );
}

function assertExpectedSyntheticAuthSurface(users) {
  const actualEmails = users
    .map((user) => user?.email?.toLowerCase())
    .filter(Boolean)
    .sort();
  const allowedEmails = new Set(EXPECTED_SYNTHETIC_AUTH_EMAILS);
  if (actualEmails.some((email) => !allowedEmails.has(email))) {
    throw new Error("The isolated staging auth surface contains a non-attested identity");
  }
  for (const user of users) {
    const scenario = Object.values(SYNTHETIC_SCENARIOS)
      .find((candidate) => candidate.email === user?.email?.toLowerCase());
    const exactPriorSingleUserFixture =
      scenario?.key === SYNTHETIC_SCENARIOS.paidDirect.key &&
      user?.user_metadata?.fixture === FIXTURE_LABEL &&
      user?.user_metadata?.synthetic === true &&
      user?.user_metadata?.scenario == null;
    if (!scenario || (!assertSyntheticAuthUser(user, scenario) && !exactPriorSingleUserFixture)) {
      throw new Error("The isolated staging auth surface contains an incorrectly labeled identity");
    }
  }
}

async function ensureSyntheticAuthUser(admin, existingByEmail, scenario, password) {
  let authUser = existingByEmail.get(scenario.email) ?? null;
  if (!authUser) {
    const created = await assertNoError(
      await admin.auth.admin.createUser({
        email: scenario.email,
        password,
        email_confirm: true,
        user_metadata: {
          fixture: FIXTURE_LABEL,
          synthetic: true,
          scenario: scenario.key,
        },
      }),
      `create ${scenario.key} staging auth user`,
    );
    authUser = created.user;
  }
  if (!authUser?.id) {
    throw new Error(`The ${scenario.key} staging auth user is not exactly attested`);
  }
  await assertNoError(
    await admin.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        fixture: FIXTURE_LABEL,
        synthetic: true,
        scenario: scenario.key,
      },
    }),
    `synchronize ${scenario.key} staging auth user`,
  );
  return authUser;
}

async function upsert(admin, table, row, onConflict) {
  const query = admin.from(table).upsert(row, { onConflict }).select("*").single();
  return assertNoError(await query, `upsert ${table}`);
}

async function assertExactCount(query, expected, label) {
  const result = await query;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.count !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${result.count ?? "unknown"}`);
  }
}

async function main() {
  const supabaseUrl = requireEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const attestedProjectRef = assertIsolatedStaging(supabaseUrl);
  const publicAppUrl = assertStagingAppUrl(requireEnvironment("NEXT_PUBLIC_APP_URL"));
  const partnerAppUrl = assertStagingPartnerAppUrl(
    requireEnvironment("STAGING_PARTNER_APP_URL"),
  );
  const partnerAppHost = new URL(partnerAppUrl).hostname;
  const publicSlug = "df-staging-20260712-funnel";
  const destinationUrl = `${publicAppUrl}/f/${publicSlug}`;
  const syntheticCreativeUrl = `${publicAppUrl}/logo.svg`;
  const syntheticCreativeContentDigest = sha256(
    readFileSync(new URL("../public/logo.svg", import.meta.url)),
  );

  const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = requireEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const qaEmail = requireEnvironment("QA_EMAIL").toLowerCase();
  const qaPassword = requireEnvironment("STAGING_QA_PASSWORD");
  const partnerAttributionSigningSecret = requireEnvironment(
    "PARTNER_ATTRIBUTION_SIGNING_SECRET",
  );
  if (qaEmail !== EXPECTED_QA_EMAIL) {
    throw new Error("QA_EMAIL must match the exact synthetic staging fixture identity");
  }
  if (
    partnerAttributionSigningSecret.length < 32 ||
    /^(?:test|example|placeholder|changeme|secret)/i.test(partnerAttributionSigningSecret)
  ) {
    throw new Error("PARTNER_ATTRIBUTION_SIGNING_SECRET must be a strong staging-only secret");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const existingAuthUsers = await listAuthUsers(admin);
  assertExpectedSyntheticAuthSurface(existingAuthUsers);
  const existingByEmail = new Map(
    existingAuthUsers.map((user) => [user.email?.toLowerCase(), user]),
  );
  const scenarioAuthUsers = {};
  for (const [scenarioName, scenario] of Object.entries(SYNTHETIC_SCENARIOS)) {
    scenarioAuthUsers[scenarioName] = await ensureSyntheticAuthUser(
      admin,
      existingByEmail,
      scenario,
      qaPassword,
    );
  }
  const authUser = scenarioAuthUsers.paidDirect;
  const userId = authUser.id;
  await upsert(admin, "users", {
    id: userId,
    email: qaEmail,
    full_name: SYNTHETIC_SCENARIOS.paidDirect.fullName,
    avatar_url: null,
  }, "id");

  await upsert(admin, "organizations", {
    id: IDS.organization,
    name: `${FIXTURE_LABEL} Realty`,
    slug: "df-staging-20260712-realty",
    plan_tier: "pro",
    owner_user_id: userId,
  }, "id");

  await upsert(admin, "organization_memberships", {
    id: IDS.membership,
    organization_id: IDS.organization,
    user_id: userId,
    // The restricted QA-session route must remain non-elevated. Workspace
    // ownership is still bound by organizations.owner_user_id.
    role: "member",
  }, "id");

  const qaClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await assertNoError(
    await qaClient.auth.signInWithPassword({ email: qaEmail, password: qaPassword }),
    "sign in staging realtor",
  );

  const scenarioUserIds = Object.fromEntries(
    Object.entries(scenarioAuthUsers).map(([name, user]) => [name, user.id]),
  );

  await upsert(admin, "partners", {
    id: IDS.partner,
    slug: "df-staging-white-label",
    brand_name: `${FIXTURE_LABEL} Partner Realty OS`,
    legal_name: `${FIXTURE_LABEL} Synthetic Partner Inc.`,
    logo_url: `${publicAppUrl}/logo.svg`,
    favicon_url: `${publicAppUrl}/favicon.ico`,
    primary_color: "#2563eb",
    secondary_color: "#0f172a",
    accent_color: "#22d3ee",
    support_email: "dealflow-staging-partner-support@example.com",
    support_phone: null,
    commission_rate: 0,
    default_timezone: "America/Toronto",
    status: "active",
    powered_by_dealflow: true,
    created_by: scenarioUserIds.partnerAdmin,
    updated_by: scenarioUserIds.partnerAdmin,
    deleted_at: null,
  }, "id");

  for (const [scenarioName, scenario] of Object.entries(SYNTHETIC_SCENARIOS)) {
    // The child user and workspace are deliberately left unbound here. The
    // service-role RPC below performs all three attribution writes as one
    // serialized database decision after revalidating the deployment host.
    const userRow = {
      id: scenarioUserIds[scenarioName],
      email: scenario.email,
      full_name: scenario.fullName,
      avatar_url: null,
    };
    if (scenarioName === "partnerAdmin") userRow.partner_id = IDS.partner;
    if (scenarioName !== "partnerChild" && scenarioName !== "partnerAdmin") {
      userRow.partner_id = null;
    }
    await upsert(admin, "users", userRow, "id");
  }

  const organizationScenarios = [
    {
      id: IDS.newOrganization,
      membershipId: IDS.newMembership,
      userId: scenarioUserIds.newDirect,
      name: `${FIXTURE_LABEL} New Direct Realty`,
      slug: "df-staging-new-direct-realty",
      role: "owner",
    },
    {
      id: IDS.legacyOrganization,
      membershipId: IDS.legacyMembership,
      userId: scenarioUserIds.legacy,
      name: `${FIXTURE_LABEL} Legacy Realty`,
      slug: "df-staging-legacy-realty",
      role: "owner",
    },
    {
      id: IDS.partnerAdminOrganization,
      membershipId: IDS.partnerAdminOrganizationMembership,
      userId: scenarioUserIds.partnerAdmin,
      name: `${FIXTURE_LABEL} Partner Administration`,
      slug: "df-staging-partner-administration",
      role: "owner",
      partnerId: IDS.partner,
    },
    {
      id: IDS.partnerChildOrganization,
      membershipId: IDS.partnerChildMembership,
      userId: scenarioUserIds.partnerChild,
      name: `${FIXTURE_LABEL} White Label Child Realty`,
      slug: "df-staging-white-label-child-realty",
      role: "owner",
    },
    {
      id: IDS.operatorOrganization,
      membershipId: IDS.operatorMembership,
      userId: scenarioUserIds.operator,
      name: `${FIXTURE_LABEL} Operator Workspace`,
      slug: "df-staging-operator-workspace",
      role: "admin",
    },
    {
      id: IDS.attackerOrganization,
      membershipId: IDS.attackerMembership,
      userId: scenarioUserIds.attacker,
      name: `${FIXTURE_LABEL} Adversarial Realty`,
      slug: "df-staging-adversarial-realty",
      role: "owner",
    },
  ];
  for (const organization of organizationScenarios) {
    const organizationRow = {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      plan_tier: "pro",
      owner_user_id: organization.userId,
    };
    if (organization.partnerId) organizationRow.partner_id = organization.partnerId;
    await upsert(admin, "organizations", organizationRow, "id");
    await upsert(admin, "organization_memberships", {
      id: organization.membershipId,
      organization_id: organization.id,
      user_id: organization.userId,
      role: organization.role,
    }, "id");
  }

  await upsert(admin, "partner_memberships", {
    id: IDS.partnerMembership,
    partner_id: IDS.partner,
    user_id: scenarioUserIds.partnerAdmin,
    role: "partner_admin",
    status: "active",
  }, "id");
  await upsert(admin, "partner_branding", {
    id: IDS.partnerBranding,
    partner_id: IDS.partner,
    theme_json: {
      fixture: FIXTURE_LABEL,
      synthetic: true,
      primaryColor: "#2563eb",
      accentColor: "#22d3ee",
      logoUrl: `${publicAppUrl}/logo.svg`,
    },
    copy_json: {
      fixture: FIXTURE_LABEL,
      appName: `${FIXTURE_LABEL} Partner Realty OS`,
      loginEyebrow: "Synthetic white-label staging proof",
      loginHeadline: "Launch real estate campaigns with your partner workspace",
      loginSubheadline: "A synthetic isolated-staging branding fixture.",
    },
    email_branding_json: { fixture: FIXTURE_LABEL, synthetic: true },
    pricing_json: { fixture: FIXTURE_LABEL, synthetic: true, plan: "pro" },
    feature_flags_json: { fixture: FIXTURE_LABEL, synthetic: true },
  }, "id");
  await upsert(admin, "partner_domains", {
    id: IDS.partnerDomain,
    partner_id: IDS.partner,
    domain: partnerAppHost,
    type: "preview",
    verification_status: "verified",
    ssl_status: "active",
    verification_token: "df-staging-qibh-synthetic-domain-proof",
    dns_target: partnerAppHost,
    last_checked_at: FIXTURE_TIMESTAMP,
    deleted_at: null,
  }, "id");
  const partnerBindingRows = await assertNoError(
    await admin.rpc("bind_verified_partner_attribution_v1", {
      p_user_id: scenarioUserIds.partnerChild,
      p_organization_id: IDS.partnerChildOrganization,
      p_partner_id: IDS.partner,
      p_verified_domain: partnerAppHost,
    }),
    "atomically bind verified staging partner attribution",
  );
  const partnerBinding = Array.isArray(partnerBindingRows)
    ? partnerBindingRows[0]
    : partnerBindingRows;
  if (
    !partnerBinding ||
    !["bound", "already_bound"].includes(partnerBinding.binding_status) ||
    partnerBinding.resolved_partner_id !== IDS.partner ||
    partnerBinding.resolved_user_partner_id !== IDS.partner ||
    partnerBinding.resolved_organization_partner_id !== IDS.partner ||
    partnerBinding.attribution_active !== true
  ) {
    throw new Error("Atomic verified staging partner attribution did not satisfy its postcondition");
  }

  await upsert(admin, "billing_subscriptions", {
    id: IDS.legacyBilling,
    organization_id: IDS.legacyOrganization,
    user_id: scenarioUserIds.legacy,
    stripe_customer_id: "cus_test_df_staging_legacy_20260712",
    stripe_subscription_id: "sub_test_df_staging_legacy_20260712",
    stripe_price_id: "price_test_df_staging_legacy_growth",
    plan_tier: "growth",
    status: "active",
    metadata: {
      fixture: FIXTURE_LABEL,
      synthetic: true,
      livemode: false,
      legacy_plan_tier_reconciled: "true",
      legacy_commercial_activation_reconciled: true,
    },
    stripe_latest_event_id: "evt_test_df_staging_legacy_reconciled",
    stripe_latest_event_created: 1_788_739_100,
  }, "id");

  await upsert(admin, "system_jobs", {
    id: IDS.retryJob,
    organization_id: IDS.organization,
    user_id: userId,
    campaign_id: null,
    kind: "lead_capture_retry",
    status: "pending",
    payload: {
      fixture: FIXTURE_LABEL,
      synthetic: true,
      scenario: "durable_retry_pending",
      provider_actions_allowed: false,
      contains_customer_data: false,
    },
    result: null,
    retry_count: 1,
    attempt_count: 1,
    max_attempts: 3,
    idempotency_key: "df-staging-20260712-durable-retry",
    next_run_at: "2099-01-01T00:00:00.000Z",
    error_message: "Synthetic retryable failure; execution intentionally deferred.",
    last_error_code: "synthetic_retryable_failure",
    dead_lettered_at: null,
    dead_letter_reason: null,
    locked_by: null,
    locked_until: null,
    lease_token: null,
    lease_heartbeat_at: null,
  }, "id");
  await upsert(admin, "system_jobs", {
    id: IDS.deadLetterJob,
    organization_id: IDS.organization,
    user_id: userId,
    campaign_id: null,
    kind: "lead_capture_retry",
    status: "failed",
    payload: {
      fixture: FIXTURE_LABEL,
      synthetic: true,
      scenario: "durable_operator_failure",
      provider_actions_allowed: false,
      contains_customer_data: false,
    },
    result: { fixture: FIXTURE_LABEL, providerMutationPerformed: false },
    retry_count: 3,
    attempt_count: 3,
    max_attempts: 3,
    idempotency_key: "df-staging-20260712-durable-dead-letter",
    next_run_at: null,
    error_message: "Synthetic terminal failure for operator acceptance proof.",
    last_error_code: "synthetic_terminal_failure",
    dead_lettered_at: FIXTURE_TIMESTAMP,
    dead_letter_reason: "Synthetic failure fixture; no provider action was attempted.",
    completed_at: FIXTURE_TIMESTAMP,
    locked_by: null,
    locked_until: null,
    lease_token: null,
    lease_heartbeat_at: null,
  }, "id");

  const stripeEventId = "evt_test_df_staging_20260712_initial_payment";
  const stripeSubscriptionId = "sub_test_df_staging_20260712";
  await upsert(admin, "billing_subscriptions", {
    id: IDS.billing,
    organization_id: IDS.organization,
    user_id: userId,
    stripe_customer_id: "cus_test_df_staging_20260712",
    stripe_subscription_id: stripeSubscriptionId,
    stripe_price_id: "price_test_df_staging_297_monthly",
    plan_tier: "pro",
    status: "active",
    metadata: {
      fixture: FIXTURE_LABEL,
      synthetic: true,
      livemode: false,
      price_usd_cents: 29_700,
    },
    stripe_latest_event_id: stripeEventId,
    stripe_latest_event_created: 1_788_739_200,
  }, "id");

  const activationInput = {
    p_organization_id: IDS.organization,
    p_user_id: userId,
    p_source_event_id: stripeEventId,
    p_source_event_type: "invoice.payment_succeeded",
    p_source_event_created: 1_788_739_200,
    p_source_payment_id: "pi_test_df_staging_20260712",
    p_source_subscription_id: stripeSubscriptionId,
    p_amount_paid_cents: 29_700,
    p_currency: "usd",
    p_metadata: { fixture: FIXTURE_LABEL, synthetic: true, livemode: false },
  };
  const activationRows = await assertNoError(
    await admin.rpc("record_commercial_activation_with_initial_credit", activationInput),
    "record synthetic staging commercial activation",
  );
  const activation = Array.isArray(activationRows) ? activationRows[0] : activationRows;
  if (
    !activation?.activation_id ||
    !activation?.ledger_id ||
    activation.balance !== 1_000
  ) {
    throw new Error("The synthetic staging activation did not return its durable activation and credit receipts");
  }

  const replayRows = await assertNoError(
    await admin.rpc("record_commercial_activation_with_initial_credit", activationInput),
    "replay synthetic staging commercial activation",
  );
  const activationReplay = Array.isArray(replayRows) ? replayRows[0] : replayRows;
  if (
    activationReplay?.activation_id !== activation.activation_id ||
    activationReplay?.ledger_id !== activation.ledger_id ||
    activationReplay?.reused_existing !== true ||
    activationReplay?.activation_created !== false ||
    activationReplay?.initial_credit_granted !== false ||
    activationReplay?.balance !== 1_000
  ) {
    throw new Error("The synthetic staging commercial activation replay was not exactly idempotent");
  }

  const activationTruth = await assertNoError(
    await admin
      .from("commercial_activations")
      .select("id,organization_id,user_id,source_provider,source_event_id,source_event_type,source_event_created,source_payment_id,source_subscription_id,amount_paid_cents,currency")
      .eq("organization_id", IDS.organization)
      .single(),
    "read back synthetic staging commercial activation",
  );
  if (
    activationTruth.id !== activation.activation_id ||
    activationTruth.organization_id !== IDS.organization ||
    activationTruth.user_id !== userId ||
    activationTruth.source_provider !== "stripe" ||
    activationTruth.source_event_id !== stripeEventId ||
    activationTruth.source_event_type !== "invoice.payment_succeeded" ||
    activationTruth.source_event_created !== 1_788_739_200 ||
    activationTruth.source_payment_id !== "pi_test_df_staging_20260712" ||
    activationTruth.source_subscription_id !== stripeSubscriptionId ||
    activationTruth.amount_paid_cents !== 29_700 ||
    activationTruth.currency !== "usd"
  ) {
    throw new Error("The synthetic staging commercial activation truth does not match the exact $297 test payment");
  }

  const initialCreditTruth = await assertNoError(
    await admin
      .from("user_credit_ledger")
      .select("id,user_id,organization_id,delta,balance_after,reason,reference_type,reference_id,idempotency_key")
      .eq("id", activation.ledger_id)
      .single(),
    "read back synthetic staging initial credit",
  );
  if (
    initialCreditTruth.user_id !== userId ||
    initialCreditTruth.organization_id !== IDS.organization ||
    initialCreditTruth.delta !== 1_000 ||
    initialCreditTruth.balance_after !== 1_000 ||
    initialCreditTruth.reason !== "commercial_activation_initial_credit" ||
    initialCreditTruth.reference_type !== "commercial_activation" ||
    initialCreditTruth.reference_id !== activation.activation_id ||
    initialCreditTruth.idempotency_key !== `commercial_activation_initial_credit:${IDS.organization}`
  ) {
    throw new Error("The synthetic staging activation did not preserve the exact one-time $10 initial credit truth");
  }

  const ghlActivationRows = await assertNoError(
    await admin.rpc("request_ghl_provisioning_from_billing_activation_v1", {
      p_organization_id: IDS.organization,
      p_user_id: userId,
      p_environment: "sandbox",
      p_commercial_activation_id: activation.activation_id,
      p_stripe_subscription_id: stripeSubscriptionId,
    }),
    "request synthetic staging GHL activation",
  );
  const ghlActivation = Array.isArray(ghlActivationRows)
    ? ghlActivationRows[0]
    : ghlActivationRows;
  if (!ghlActivation?.request_id) {
    throw new Error("The synthetic staging GHL activation request returned no durable receipt");
  }

  const campaignPlan = {
    fixture: FIXTURE_LABEL,
    objective: "Synthetic staging lead generation",
    customer_type: "realtor",
    name: `${FIXTURE_LABEL} Toronto Buyer Campaign`,
    campaign_name: `${FIXTURE_LABEL} Toronto Buyer Campaign`,
    market: "Toronto, Ontario",
    location: "Toronto, Ontario",
    intent: "buyer",
    monthly_budget: 300,
    daily_budget_cents: META_FIXTURE.dailyBudgetCents,
    ad_destination: META_FIXTURE.adDestination,
    lead_capture_mode: META_FIXTURE.adDestination,
    selected_ad_id: META_FIXTURE.selectedAdId,
    selected_ad_ids: [META_FIXTURE.selectedAdId],
    campaign_payload: {
      destination_url: destinationUrl,
      daily_budget_cents: META_FIXTURE.dailyBudgetCents,
      ad_destination: META_FIXTURE.adDestination,
      lead_capture_mode: META_FIXTURE.adDestination,
      selected_ad_id: META_FIXTURE.selectedAdId,
      selected_ad_ids: [META_FIXTURE.selectedAdId],
    },
    creatives: {
      staticAds: [{
        id: META_FIXTURE.selectedAdId,
        angle: "opportunity",
        imageUrl: syntheticCreativeUrl,
        imageGenerationState: "generated",
        imageGenerationMessage: null,
        imageGenerationModel: "synthetic-staging",
        visualConcept: "Synthetic Toronto home search creative",
        imagePrompt: "Synthetic staging-only real estate creative",
        imagePromptConfig: null,
        preferredImageModel: "gpt-image-1.5",
        visualPromptBrief: null,
        scoreBreakdown: null,
        hook: "Find the right Toronto home",
        overlayText: "Toronto homes matched to your move",
        primaryText: "Explore a synthetic staging-only Toronto home search campaign.",
        headline: "Find your next Toronto home",
        cta: "Learn More",
        score: 100,
        recommended: true,
      }],
      videoAds: [],
    },
    launch_status: "ready",
    lead_loop_verified: true,
    public_slug: publicSlug,
  };
  await assertNoError(
    await admin.rpc("create_campaign_plan_with_entitlement_v1", {
      p_campaign_id: IDS.campaign,
      p_organization_id: IDS.organization,
      p_user_id: userId,
      p_plan: campaignPlan,
      p_launch_status: "ready",
      p_lead_loop_verified: true,
      p_public_slug: publicSlug,
    }),
    "create staging campaign through entitlement RPC",
  );
  await assertNoError(await admin.from("campaign_plans").update({
    plan: campaignPlan,
    ads: [],
    business_name: `${FIXTURE_LABEL} Realty`,
    status: "draft",
    client_name: `${FIXTURE_LABEL} Realtor`,
    industry: "Real estate",
    location: "Toronto, Ontario",
    budget: "10",
    public_slug: publicSlug,
    publish_state: "published",
    launch_status: "ready",
    lead_loop_verified: true,
    published_snapshot: {
      fixture: FIXTURE_LABEL,
      name: `${FIXTURE_LABEL} Toronto Buyer Campaign`,
      headline: "Find your next Toronto home",
      offer: "Synthetic staging market guide",
    },
    published_at: FIXTURE_TIMESTAMP,
  }).eq("id", IDS.campaign).select("id").single(), "complete staging campaign fixture");

  await upsert(admin, "leads", {
    id: IDS.lead,
    organization_id: IDS.organization,
    tenant_id: IDS.organization,
    user_id: userId,
    campaign_id: IDS.campaign,
    source: "synthetic_staging",
    name: `${FIXTURE_LABEL} Lead`,
    first_name: "Synthetic",
    last_name: "Staging Lead",
    email: "dealflow-staging-lead@example.com",
    phone_raw: "+15005550006",
    phone_e164: "+15005550006",
    campaign_name: `${FIXTURE_LABEL} Campaign`,
    lead_type: "buyer",
    status: "new",
    dedupe_hash: "df-staging-20260712-lead",
    consent_metadata: { fixture: FIXTURE_LABEL, synthetic: true, sms: false },
  }, "id");

  await upsert(admin, "lead_messages", {
    id: IDS.leadMessage,
    lead_id: IDS.lead,
    direction: "inbound",
    message: `${FIXTURE_LABEL} synthetic inquiry`,
    provider_message_id: "df-staging-20260712-message",
  }, "id");

  await upsert(admin, "marketing_accounts", {
    id: IDS.marketingAccount,
    organization_id: IDS.organization,
    name: `${FIXTURE_LABEL} Meta Sandbox`,
    platform: "meta_ads",
    status: "connected",
    account_name: `${FIXTURE_LABEL} Meta Sandbox`,
    external_account_id: META_FIXTURE.externalAdAccountId,
    pixel_id: META_FIXTURE.providerPixelId,
    access_token_encrypted: null,
    refresh_token_encrypted: null,
    token_expires_at: null,
    verification_token: null,
    connection_metadata: {
      fixture: FIXTURE_LABEL,
      synthetic: true,
      execution_mode: "sandbox",
      provider_actions_allowed: false,
      selected_external_account_id: META_FIXTURE.externalAdAccountId,
      selected_account_name: `${FIXTURE_LABEL} Meta Sandbox`,
      selected_account_currency: META_FIXTURE.currency,
      selected_page_id: META_FIXTURE.providerPageId,
      selected_page_name: `${FIXTURE_LABEL} Facebook Page`,
      pixel_id: META_FIXTURE.providerPixelId,
      available_accounts: [{
        id: META_FIXTURE.providerAdAccountId,
        external_account_id: META_FIXTURE.externalAdAccountId,
        name: `${FIXTURE_LABEL} Meta Sandbox`,
        currency: META_FIXTURE.currency,
        timezone_name: "America/Toronto",
      }],
      available_pages: [{
        id: META_FIXTURE.providerPageId,
        name: `${FIXTURE_LABEL} Facebook Page`,
      }],
      available_pixels: [{
        id: META_FIXTURE.providerPixelId,
        name: `${FIXTURE_LABEL} Pixel`,
      }],
    },
  }, "id");

  await upsert(admin, "creative_assets", {
    id: IDS.creativeAsset,
    user_id: userId,
    campaign_id: IDS.campaign,
    creative_id: META_FIXTURE.selectedAdId,
    asset_type: "image",
    format: "square",
    generation_method: "image_generation",
    status: "ready",
    provider_name: "synthetic_staging",
    file_url: syntheticCreativeUrl,
    type: "image",
    metadata: {
      fixture: FIXTURE_LABEL,
      synthetic: true,
      source: "static_ad",
      role: "background_image",
      staticAssetId: META_FIXTURE.selectedAdId,
      angle: "opportunity",
      overlayText: "Toronto homes matched to your move",
      primaryText: "Explore a synthetic staging-only Toronto home search campaign.",
      headline: "Find your next Toronto home",
      cta: "Learn More",
      visualConcept: "Synthetic Toronto home search creative",
      imagePrompt: "Synthetic staging-only real estate creative",
      imageGenerationModel: "synthetic-staging",
      preferredImageModel: "gpt-image-1.5",
      score: 100,
      recommended: true,
    },
  }, "id");

  const canonicalCampaignTruth = await assertNoError(
    await admin
      .from("campaign_plans")
      .select("plan")
      .eq("id", IDS.campaign)
      .eq("organization_id", IDS.organization)
      .eq("user_id", userId)
      .single(),
    "read back synthetic canonical campaign fixture",
  );
  const canonicalPlan = canonicalCampaignTruth.plan;
  const canonicalPayload = canonicalPlan?.campaign_payload;
  const canonicalStaticAds = canonicalPlan?.creatives?.staticAds;
  if (
    canonicalPlan?.daily_budget_cents !== META_FIXTURE.dailyBudgetCents ||
    canonicalPlan?.ad_destination !== META_FIXTURE.adDestination ||
    canonicalPlan?.selected_ad_id !== META_FIXTURE.selectedAdId ||
    canonicalPayload?.daily_budget_cents !== META_FIXTURE.dailyBudgetCents ||
    canonicalPayload?.ad_destination !== META_FIXTURE.adDestination ||
    canonicalPayload?.destination_url !== destinationUrl ||
    canonicalPayload?.selected_ad_id !== META_FIXTURE.selectedAdId ||
    !Array.isArray(canonicalStaticAds) ||
    canonicalStaticAds.length !== 1 ||
    canonicalStaticAds[0]?.id !== META_FIXTURE.selectedAdId
  ) {
    throw new Error("The synthetic staging campaign does not preserve one canonical launch contract");
  }
  const canonicalCreativeTruth = await assertNoError(
    await admin
      .from("creative_assets")
      .select("creative_id,generation_method,status,file_url,metadata")
      .eq("id", IDS.creativeAsset)
      .eq("campaign_id", IDS.campaign)
      .eq("user_id", userId)
      .single(),
    "read back synthetic canonical creative fixture",
  );
  if (
    canonicalCreativeTruth.creative_id !== META_FIXTURE.selectedAdId ||
    canonicalCreativeTruth.generation_method !== "image_generation" ||
    canonicalCreativeTruth.status !== "ready" ||
    !canonicalCreativeTruth.file_url ||
    canonicalCreativeTruth.metadata?.source !== "static_ad" ||
    canonicalCreativeTruth.metadata?.staticAssetId !== META_FIXTURE.selectedAdId
  ) {
    throw new Error("The selected synthetic staging creative does not match canonical campaign truth");
  }

  const existingLaunch = await assertNoError(
    await admin
      .from("campaign_launch_records")
      .select("id,result_status,launch_mode,scheduled_for,execution_metadata")
      .eq("organization_id", IDS.organization)
      .eq("user_id", userId)
      .eq("campaign_id", IDS.campaign)
      .maybeSingle(),
    "check for an existing synthetic atomic launch fixture",
  );
  if (
    existingLaunch &&
    (
      existingLaunch.result_status !== "scheduled" ||
      existingLaunch.launch_mode !== "scheduled_provider_paused" ||
      !existingLaunch.scheduled_for ||
      existingLaunch.execution_metadata?.providerMutationPerformed !== false ||
      existingLaunch.execution_metadata?.customerPreauthorizationRequired !== true
    )
  ) {
    throw new Error("The existing synthetic staging launch is not an untouched atomic authorization fixture");
  }
  const scheduledFor = existingLaunch?.scheduled_for ?? getNextEligibleLaunchAt(new Date()).toISOString();
  const launchApprovalSnapshot = {
    schema_version: 1,
    organization_id: IDS.organization,
    campaign_id: IDS.campaign,
    attempt_id: sha256(`${IDS.organization}:${IDS.campaign}`).slice(0, 16),
    provider: {
      ad_account_id: META_FIXTURE.providerAdAccountId,
      account_currency: META_FIXTURE.currency,
      page_id: META_FIXTURE.providerPageId,
      pixel_id: META_FIXTURE.providerPixelId,
    },
    creative: {
      selected_ad_id: META_FIXTURE.selectedAdId,
      image_content_sha256: syntheticCreativeContentDigest,
      primary_text_sha256: sha256("Explore a synthetic staging-only Toronto home search campaign."),
      headline_sha256: sha256("Find your next Toronto home"),
    },
    destination_url: destinationUrl,
    destination_host: EXPECTED_STAGING_APP_HOST,
    destination: {
      capture_experience: META_FIXTURE.adDestination,
      ad_destination: META_FIXTURE.adDestination,
      provider_form_id: null,
      form_definition_digest: sha256(`${FIXTURE_LABEL}:meta-instant-form-definition`),
    },
    delivery: {
      objective: "OUTCOME_LEADS",
      country_code: "CA",
      location: "Toronto, Ontario",
      daily_budget_minor: String(META_FIXTURE.dailyBudgetCents),
      special_ad_categories: ["HOUSING"],
    },
  };
  const customerApprovalDigest = sha256(JSON.stringify({
    version: 1,
    fixture: FIXTURE_LABEL,
    organizationId: IDS.organization,
    campaignId: IDS.campaign,
    scheduledFor,
    approvedDailyBudgetMinor: META_FIXTURE.dailyBudgetCents,
    approvedCurrency: META_FIXTURE.currency,
    launchApprovalSnapshot,
  }));
  const atomicAuthorizationInput = {
    p_organization_id: IDS.organization,
    p_customer_user_id: userId,
    p_campaign_id: IDS.campaign,
    p_campaign_name: campaignPlan.campaign_name,
    p_scheduled_for: scheduledFor,
    p_time_zone: LAUNCH_TIME_ZONE,
    p_approved_daily_budget_minor: META_FIXTURE.dailyBudgetCents,
    p_approved_currency: META_FIXTURE.currency,
    p_provider_ad_account_id: META_FIXTURE.providerAdAccountId,
    p_provider_page_id: META_FIXTURE.providerPageId,
    p_provider_pixel_id: META_FIXTURE.providerPixelId,
    p_selected_ad_id: META_FIXTURE.selectedAdId,
    p_ad_destination: META_FIXTURE.adDestination,
    p_destination_url_digest: sha256(destinationUrl),
    p_launch_approval_snapshot: launchApprovalSnapshot,
    p_customer_approval_digest: customerApprovalDigest,
    p_idempotency_key: `synthetic_staging_meta_activation:${IDS.campaign}`,
  };
  let preauthorization;
  if (existingLaunch) {
    preauthorization = await assertNoError(
      await admin
        .from("meta_campaign_activation_preauthorizations")
        .select("*")
        .eq("organization_id", IDS.organization)
        .eq("user_id", userId)
        .eq("campaign_id", IDS.campaign)
        .eq("launch_record_id", existingLaunch.id)
        .eq("status", "authorized")
        .single(),
      "read back existing synthetic atomic Meta activation preauthorization",
    );
  } else {
    const preauthorizationRows = await assertNoError(
      await admin.rpc(
        "schedule_and_preauthorize_meta_campaign_activation",
        atomicAuthorizationInput,
      ),
      "atomically create synthetic staging launch and Meta activation preauthorization",
    );
    preauthorization = Array.isArray(preauthorizationRows)
      ? preauthorizationRows[0]
      : preauthorizationRows;
    const replayRows = await assertNoError(
      await admin.rpc("schedule_and_preauthorize_meta_campaign_activation", {
        ...atomicAuthorizationInput,
        p_idempotency_key: `synthetic_staging_meta_activation_replay:${IDS.campaign}`,
      }),
      "replay synthetic staging atomic launch and Meta activation preauthorization",
    );
    const replay = Array.isArray(replayRows) ? replayRows[0] : replayRows;
    if (replay?.id !== preauthorization?.id) {
      throw new Error("The synthetic staging atomic launch authorization replay was not idempotent");
    }
  }
  if (
    !preauthorization?.id ||
    preauthorization.status !== "authorized" ||
    !preauthorization.launch_record_id ||
    (existingLaunch && preauthorization.launch_record_id !== existingLaunch.id) ||
    !sameInstant(preauthorization.scheduled_for, scheduledFor) ||
    preauthorization.approved_daily_budget_minor !== META_FIXTURE.dailyBudgetCents ||
    preauthorization.approved_currency !== META_FIXTURE.currency ||
    preauthorization.provider_ad_account_id !== META_FIXTURE.providerAdAccountId ||
    preauthorization.provider_page_id !== META_FIXTURE.providerPageId ||
    preauthorization.provider_pixel_id !== META_FIXTURE.providerPixelId ||
    preauthorization.selected_ad_id !== META_FIXTURE.selectedAdId ||
    preauthorization.ad_destination !== META_FIXTURE.adDestination ||
    preauthorization.destination_url_digest !== sha256(destinationUrl) ||
    preauthorization.launch_approval_snapshot?.organization_id !== IDS.organization ||
    preauthorization.launch_approval_snapshot?.campaign_id !== IDS.campaign ||
    preauthorization.launch_approval_snapshot?.provider?.ad_account_id !== META_FIXTURE.providerAdAccountId ||
    preauthorization.launch_approval_snapshot?.provider?.account_currency !== META_FIXTURE.currency ||
    preauthorization.launch_approval_snapshot?.provider?.page_id !== META_FIXTURE.providerPageId ||
    preauthorization.launch_approval_snapshot?.provider?.pixel_id !== META_FIXTURE.providerPixelId ||
    preauthorization.launch_approval_snapshot?.creative?.selected_ad_id !== META_FIXTURE.selectedAdId ||
    preauthorization.launch_approval_snapshot?.destination?.ad_destination !== META_FIXTURE.adDestination ||
    preauthorization.launch_approval_snapshot?.destination_url !== destinationUrl ||
    preauthorization.launch_approval_snapshot?.delivery?.daily_budget_minor !== String(META_FIXTURE.dailyBudgetCents) ||
    preauthorization.launch_approval_snapshot?.delivery?.special_ad_categories?.[0] !== "HOUSING"
  ) {
    throw new Error("The synthetic staging Meta activation preauthorization is not canonically bound");
  }

  const launchTruth = await assertNoError(
    await admin
      .from("campaign_launch_records")
      .select("id,result_status,launch_mode,scheduled_for,execution_metadata,meta_campaign_id,meta_creative_id,meta_ad_set_ids,meta_ad_ids")
      .eq("id", preauthorization.launch_record_id)
      .eq("organization_id", IDS.organization)
      .eq("user_id", userId)
      .eq("campaign_id", IDS.campaign)
      .single(),
    "read back synthetic atomic launch fixture",
  );
  if (
    launchTruth.result_status !== "scheduled" ||
    launchTruth.launch_mode !== "scheduled_provider_paused" ||
    !sameInstant(launchTruth.scheduled_for, scheduledFor) ||
    launchTruth.execution_metadata?.providerMutationPerformed !== false ||
    launchTruth.execution_metadata?.customerPreauthorizationRequired !== true ||
    launchTruth.meta_campaign_id !== null ||
    launchTruth.meta_creative_id !== null ||
    !Array.isArray(launchTruth.meta_ad_set_ids) ||
    launchTruth.meta_ad_set_ids.length !== 0 ||
    !Array.isArray(launchTruth.meta_ad_ids) ||
    launchTruth.meta_ad_ids.length !== 0
  ) {
    throw new Error("The atomic synthetic staging launch contains provider mutation state");
  }

  const metaFixtureTruth = await assertNoError(
    await admin
      .from("marketing_accounts")
      .select("external_account_id,pixel_id,access_token_encrypted,refresh_token_encrypted,token_expires_at,verification_token,connection_metadata")
      .eq("id", IDS.marketingAccount)
      .single(),
    "read back synthetic staging Meta fixture",
  );
  const availableAccounts = metaFixtureTruth.connection_metadata?.available_accounts;
  const availablePages = metaFixtureTruth.connection_metadata?.available_pages;
  const availablePixels = metaFixtureTruth.connection_metadata?.available_pixels;
  if (
    metaFixtureTruth.external_account_id !== META_FIXTURE.externalAdAccountId ||
    metaFixtureTruth.pixel_id !== META_FIXTURE.providerPixelId ||
    metaFixtureTruth.access_token_encrypted !== null ||
    metaFixtureTruth.refresh_token_encrypted !== null ||
    metaFixtureTruth.token_expires_at !== null ||
    metaFixtureTruth.verification_token !== null ||
    metaFixtureTruth.connection_metadata?.selected_external_account_id !== META_FIXTURE.externalAdAccountId ||
    metaFixtureTruth.connection_metadata?.selected_account_name !== `${FIXTURE_LABEL} Meta Sandbox` ||
    metaFixtureTruth.connection_metadata?.selected_account_currency !== META_FIXTURE.currency ||
    metaFixtureTruth.connection_metadata?.selected_page_id !== META_FIXTURE.providerPageId ||
    metaFixtureTruth.connection_metadata?.selected_page_name !== `${FIXTURE_LABEL} Facebook Page` ||
    metaFixtureTruth.connection_metadata?.pixel_id !== META_FIXTURE.providerPixelId ||
    metaFixtureTruth.connection_metadata?.provider_actions_allowed !== false ||
    !Array.isArray(availableAccounts) ||
    availableAccounts.length !== 1 ||
    availableAccounts[0]?.id !== META_FIXTURE.providerAdAccountId ||
    availableAccounts[0]?.external_account_id !== META_FIXTURE.externalAdAccountId ||
    availableAccounts[0]?.currency !== META_FIXTURE.currency ||
    !Array.isArray(availablePages) ||
    availablePages.length !== 1 ||
    availablePages[0]?.id !== META_FIXTURE.providerPageId ||
    !Array.isArray(availablePixels) ||
    availablePixels.length !== 1 ||
    availablePixels[0]?.id !== META_FIXTURE.providerPixelId
  ) {
    throw new Error("The synthetic staging Meta fixture is incomplete or contains provider authority");
  }

  await assertExactCount(
    admin
      .from("commercial_activations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", IDS.organization)
      .eq("source_event_id", stripeEventId),
    1,
    "verify exact synthetic commercial activation count",
  );
  await assertExactCount(
    admin
      .from("user_credit_ledger")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", IDS.organization)
      .eq("idempotency_key", `commercial_activation_initial_credit:${IDS.organization}`),
    1,
    "verify exact synthetic initial-credit count",
  );
  await assertExactCount(
    admin
      .from("ghl_billing_activation_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", IDS.organization)
      .eq("environment", "sandbox")
      .eq("commercial_activation_id", activation.activation_id),
    1,
    "verify exact synthetic GHL activation-request count",
  );
  await assertExactCount(
    admin
      .from("campaign_launch_records")
      .select("id", { count: "exact", head: true })
      .eq("id", preauthorization.launch_record_id)
      .eq("result_status", "scheduled"),
    1,
    "verify exact synthetic atomic launch count",
  );
  await assertExactCount(
    admin
      .from("meta_campaign_activation_preauthorizations")
      .select("id", { count: "exact", head: true })
      .eq("id", preauthorization.id)
      .eq("status", "authorized"),
    1,
    "verify exact synthetic Meta preauthorization count",
  );
  for (const [table, id, label] of [
    ["campaign_plans", IDS.campaign, "campaign"],
    ["leads", IDS.lead, "lead"],
    ["lead_messages", IDS.leadMessage, "lead message"],
    ["marketing_accounts", IDS.marketingAccount, "marketing account"],
    ["creative_assets", IDS.creativeAsset, "creative asset"],
  ]) {
    await assertExactCount(
      admin.from(table).select("id", { count: "exact", head: true }).eq("id", id),
      1,
      `verify exact synthetic ${label} count`,
    );
  }
  for (const organization of organizationScenarios) {
    await assertExactCount(
      admin.from("organizations").select("id", { count: "exact", head: true })
        .eq("id", organization.id)
        .eq("owner_user_id", organization.userId),
      1,
      `verify exact synthetic ${organization.slug} organization`,
    );
    await assertExactCount(
      admin.from("organization_memberships").select("id", { count: "exact", head: true })
        .eq("id", organization.membershipId)
        .eq("organization_id", organization.id)
        .eq("user_id", organization.userId),
      1,
      `verify exact synthetic ${organization.slug} membership`,
    );
  }
  await assertExactCount(
    admin
      .from("billing_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", IDS.newOrganization),
    0,
    "verify new direct realtor remains unpaid",
  );
  await assertExactCount(
    admin
      .from("commercial_activations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", IDS.newOrganization),
    0,
    "verify new direct realtor remains commercially inactive",
  );
  await assertExactCount(
    admin
      .from("billing_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("id", IDS.legacyBilling)
      .eq("organization_id", IDS.legacyOrganization)
      .eq("plan_tier", "growth")
      .eq("status", "active"),
    1,
    "verify exact grandfathered legacy billing fixture",
  );
  await assertExactCount(
    admin
      .from("partner_domains")
      .select("id", { count: "exact", head: true })
      .eq("id", IDS.partnerDomain)
      .eq("partner_id", IDS.partner)
      .eq("domain", partnerAppHost)
      .eq("verification_status", "verified")
      .eq("ssl_status", "active")
      .is("deleted_at", null),
    1,
    "verify exact active verified staging partner domain",
  );
  await assertExactCount(
    admin
      .from("workspace_partner_attribution")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", IDS.partnerChildOrganization)
      .eq("partner_id", IDS.partner)
      .eq("active", true),
    1,
    "verify exact white-label child workspace attribution",
  );
  for (const [jobId, expectedStatus, label] of [
    [IDS.retryJob, "pending", "durable retry"],
    [IDS.deadLetterJob, "failed", "durable operator failure"],
  ]) {
    await assertExactCount(
      admin
        .from("system_jobs")
        .select("id", { count: "exact", head: true })
        .eq("id", jobId)
        .eq("status", expectedStatus)
        .contains("payload", {
          fixture: FIXTURE_LABEL,
          synthetic: true,
          provider_actions_allowed: false,
          contains_customer_data: false,
        }),
      1,
      `verify exact synthetic ${label} fixture`,
    );
  }
  const finalAuthUsers = await listAuthUsers(admin);
  if (finalAuthUsers.length !== EXPECTED_SYNTHETIC_AUTH_EMAILS.length) {
    throw new Error("The isolated staging project does not contain the exact synthetic auth-user set");
  }
  const finalByEmail = new Map(
    finalAuthUsers.map((user) => [user.email?.toLowerCase(), user]),
  );
  for (const scenario of Object.values(SYNTHETIC_SCENARIOS)) {
    if (!assertSyntheticAuthUser(finalByEmail.get(scenario.email), scenario)) {
      throw new Error(`The final ${scenario.key} auth identity is not exactly attested`);
    }
  }

  process.stdout.write(`${JSON.stringify({
    status: "SEEDED",
    fixture: FIXTURE_LABEL,
    projectFingerprint: sha256(attestedProjectRef),
    safeSuffix: attestedProjectRef.slice(-4),
    userId,
    organizationId: IDS.organization,
    campaignId: IDS.campaign,
    leadId: IDS.lead,
    launchRecordId: preauthorization.launch_record_id,
    scheduledFor,
    metaActivationPreauthorizationId: preauthorization.id,
    metaActivationPreauthorizationStatus: preauthorization.status,
    metaActivationReplayIdempotent: true,
    approvedDailyBudgetMinor: META_FIXTURE.dailyBudgetCents,
    approvedCurrency: META_FIXTURE.currency,
    adDestination: META_FIXTURE.adDestination,
    providerCredentialPresent: false,
    providerMutationPerformed: false,
    commercialActivationId: activation.activation_id,
    commercialActivationReused: activation.reused_existing === true,
    initialCreditGranted: activation.initial_credit_granted === true,
    initialCreditCents: initialCreditTruth.delta,
    activationReplayIdempotent: true,
    ghlActivationRequestId: ghlActivation.request_id,
    ghlActivationStatus: ghlActivation.request_status,
    ghlActivationBlocker: ghlActivation.blocker_code ?? null,
    exactFixtureCountsVerified: true,
    exactSyntheticAuthUserCount: finalAuthUsers.length,
    scenarios: Object.fromEntries(
      Object.entries(SYNTHETIC_SCENARIOS).map(([name, scenario]) => [name, {
        scenario: scenario.key,
        userId: scenarioUserIds[name],
      }]),
    ),
    organizations: {
      paidDirect: IDS.organization,
      newDirect: IDS.newOrganization,
      legacy: IDS.legacyOrganization,
      partnerAdmin: IDS.partnerAdminOrganization,
      partnerChild: IDS.partnerChildOrganization,
      operator: IDS.operatorOrganization,
      attacker: IDS.attackerOrganization,
    },
    partner: {
      id: IDS.partner,
      childOrganizationId: IDS.partnerChildOrganization,
      domainHost: partnerAppHost,
      domainVerified: true,
      sslActive: true,
      brandingPresent: true,
      attributionPresent: true,
      attributionBoundAtomically: true,
    },
    failureFixtures: {
      retryJobId: IDS.retryJob,
      retryJobStatus: "pending",
      retryNotBefore: "2099-01-01T00:00:00.000Z",
      deadLetterJobId: IDS.deadLetterJob,
      deadLetterJobStatus: "failed",
      providerMutationPerformed: false,
    },
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
