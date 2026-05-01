#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const password = `Rls-${randomUUID()}-Aa1!`;
const stamp = Date.now();

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function assertNoError(error, context) {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

function rowId() {
  return randomUUID();
}

async function insertOne(admin, table, row) {
  const { data, error } = await admin.from(table).insert(row).select("*").single();
  assertNoError(error, `insert ${table}`);
  return data;
}

async function signIn(anon, email) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  assertNoError(error, `sign in ${email}`);
  if (!data.session?.access_token) {
    throw new Error(`sign in ${email}: missing access token`);
  }
  return data.session.access_token;
}

async function createFixtureSession(admin, anon, email) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  assertNoError(error, `generate fixture session link ${email}`);

  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) {
    throw new Error(`generate fixture session link ${email}: missing token hash`);
  }

  const { data: sessionData, error: verifyError } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  assertNoError(verifyError, `verify fixture session ${email}`);

  if (!sessionData.session?.access_token) {
    throw new Error(`verify fixture session ${email}: missing access token`);
  }

  return sessionData.session.access_token;
}

async function expectMutationHidden({ jwt, table, idColumn = "id", id, patch }) {
  const response = await fetch(
    `${requireEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "")}/rest/v1/${table}?${encodeURIComponent(idColumn)}=eq.${encodeURIComponent(id)}&select=*`,
    {
      method: "PATCH",
      headers: {
        apikey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
    },
  );

  const text = await response.text();
  if ([401, 403, 404].includes(response.status)) {
    return;
  }

  if (!response.ok) {
    throw new Error(`${table} mutation check returned ${response.status}: ${text}`);
  }

  const rows = text ? JSON.parse(text) : [];
  if (Array.isArray(rows) && rows.length === 0) {
    return;
  }

  throw new Error(`${table} cross-tenant mutation was not blocked`);
}

async function expectMembershipSelfJoinBlocked({ jwt, organizationId, userId }) {
  const response = await fetch(
    `${requireEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "")}/rest/v1/organization_memberships`,
    {
      method: "POST",
      headers: {
        apikey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        organization_id: organizationId,
        user_id: userId,
        role: "member",
      }),
    },
  );

  if ([401, 403].includes(response.status)) {
    return;
  }

  const text = await response.text();
  throw new Error(`organization_memberships self-join was not blocked: ${response.status} ${text}`);
}

async function cleanup(admin, fixtures, authUserIds) {
  const deletes = [
    ["user_credit_ledger", "id", fixtures.userCreditLedgerIds],
    ["user_credits", "user_id", fixtures.userCreditUserIds],
    ["stripe_webhook_events", "id", fixtures.stripeEventIds],
    ["provider_usage_events", "id", fixtures.providerEventIds],
    ["provider_usage_limits", "id", fixtures.providerLimitIds],
    ["meta_launch_locks", "campaign_id", fixtures.campaignIds],
    ["lead_messages", "id", fixtures.leadMessageIds],
    ["creative_assets", "id", fixtures.creativeAssetIds],
    ["marketing_accounts", "id", fixtures.marketingAccountIds],
    ["billing_subscriptions", "id", fixtures.billingIds],
    ["system_jobs", "id", fixtures.jobIds],
    ["leads", "id", fixtures.leadIds],
    ["campaign_plans", "id", fixtures.campaignIds],
    ["organizations", "id", fixtures.orgIds],
    ["users", "id", authUserIds],
  ];

  for (const [table, column, ids] of deletes) {
    if (ids.length === 0) {
      continue;
    }
    await admin.from(table).delete().in(column, ids);
  }

  for (const userId of authUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
}

async function createTenant(admin, suffix) {
  const email = `rls-fixture-${stamp}-${suffix}@example.com`;
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assertNoError(authError, `create auth user ${suffix}`);
  const userId = authData.user?.id;
  if (!userId) {
    throw new Error(`create auth user ${suffix}: missing user id`);
  }

  await insertOne(admin, "users", {
    id: userId,
    email,
    full_name: `RLS Fixture ${suffix}`,
    avatar_url: null,
  });

  const org = await insertOne(admin, "organizations", {
    id: rowId(),
    name: `RLS Fixture Org ${suffix}`,
    slug: `rls-fixture-${stamp}-${suffix}`,
    plan_tier: "pro",
    owner_user_id: userId,
  });

  const campaign = await insertOne(admin, "campaign_plans", {
    id: rowId(),
    owner_id: userId,
    user_id: userId,
    organization_id: org.id,
    plan: { fixture: true, suffix },
    ads: [],
    business_name: `RLS Fixture Business ${suffix}`,
    status: "draft",
    client_name: `RLS Fixture Client ${suffix}`,
    industry: "Security fixture",
    location: "Test",
    budget: "100",
    public_slug: `rls-fixture-${stamp}-${suffix}`,
    publish_state: "draft",
  });

  const lead = await insertOne(admin, "leads", {
    id: rowId(),
    organization_id: org.id,
    user_id: userId,
    campaign_id: campaign.id,
    source: "rls_fixture",
    name: `RLS Fixture Lead ${suffix}`,
    first_name: "RLS",
    last_name: `Fixture ${suffix}`,
    email: `rls-lead-${stamp}-${suffix}@example.com`,
    status: "new",
    dedupe_hash: `rls-fixture-${stamp}-${suffix}`,
    consent_metadata: { fixture: true, suffix },
  });

  const leadMessage = await insertOne(admin, "lead_messages", {
    id: rowId(),
    lead_id: lead.id,
    direction: "inbound",
    message: `RLS fixture message ${suffix}`,
    provider_message_id: `rls-fixture-message-${stamp}-${suffix}`,
  });

  const marketingAccount = await insertOne(admin, "marketing_accounts", {
    id: rowId(),
    organization_id: org.id,
    name: `RLS Fixture Meta ${suffix}`,
    platform: "meta",
    status: "connected",
    account_name: `RLS Fixture Meta ${suffix}`,
    external_account_id: `act_rls_${stamp}_${suffix}`,
    pixel_id: `pixel_rls_${stamp}_${suffix}`,
  });

  const creativeAsset = await insertOne(admin, "creative_assets", {
    id: rowId(),
    user_id: userId,
    campaign_id: campaign.id,
    creative_id: `rls-creative-${stamp}-${suffix}`,
    asset_type: "image",
    format: "square",
    generation_method: "fixture",
    status: "ready",
    provider_name: "fixture",
    file_url: "https://example.com/fixture.png",
    type: "image",
  });

  const billing = await insertOne(admin, "billing_subscriptions", {
    id: rowId(),
    organization_id: org.id,
    user_id: userId,
    stripe_customer_id: `cus_rls_${stamp}_${suffix}`,
    stripe_subscription_id: `sub_rls_${stamp}_${suffix}`,
    stripe_price_id: `price_rls_${stamp}_${suffix}`,
    plan_tier: "pro",
    status: "active",
    metadata: { fixture: true, suffix },
    stripe_latest_event_id: `evt_rls_${stamp}_${suffix}`,
    stripe_latest_event_created: Math.floor(Date.now() / 1000),
  });

  const job = await insertOne(admin, "system_jobs", {
    id: rowId(),
    organization_id: org.id,
    user_id: userId,
    campaign_id: campaign.id,
    kind: "rls_fixture",
    status: "pending",
    payload: { fixture: true, suffix },
    max_attempts: 1,
  });

  const stripeEvent = await insertOne(admin, "stripe_webhook_events", {
    id: rowId(),
    stripe_event_id: `evt_rls_${stamp}_${suffix}`,
    stripe_event_type: "customer.subscription.updated",
    stripe_object_id: `sub_rls_${stamp}_${suffix}`,
    organization_id: org.id,
    stripe_subscription_id: `sub_rls_${stamp}_${suffix}`,
    status: "processed",
    processed_at: new Date().toISOString(),
    payload: { fixture: true, livemode: false, suffix },
  });

  const providerLimit = await insertOne(admin, "provider_usage_limits", {
    id: rowId(),
    organization_id: org.id,
    user_id: userId,
    campaign_id: campaign.id,
    provider: "fixture",
    operation: `rls-${suffix}`,
    usage_count: 0,
    limit_count: 1,
  });

  const providerEvent = await insertOne(admin, "provider_usage_events", {
    id: rowId(),
    organization_id: org.id,
    user_id: userId,
    campaign_id: campaign.id,
    provider: "fixture",
    operation: `rls-${suffix}`,
    idempotency_key: `rls-fixture-${stamp}-${suffix}`,
    status: "consumed",
    metadata: { fixture: true, suffix },
  });

  const userCredit = await insertOne(admin, "user_credits", {
    user_id: userId,
    balance: 2500,
  });

  const userCreditLedger = await insertOne(admin, "user_credit_ledger", {
    id: rowId(),
    user_id: userId,
    organization_id: org.id,
    delta: 2500,
    balance_after: 2500,
    reason: "rls_fixture",
    reference_type: "rls_fixture",
    reference_id: `rls-fixture-${stamp}-${suffix}`,
    idempotency_key: `rls-fixture-credit-${stamp}-${suffix}`,
    metadata: { fixture: true, suffix },
  });

  await insertOne(admin, "meta_launch_locks", {
    campaign_id: campaign.id,
    lock_token: `rls-fixture-${stamp}-${suffix}`,
    locked_by: "rls-fixture",
    locked_until: new Date(Date.now() + 60_000).toISOString(),
  });

  return {
    userId,
    email,
    org,
    campaign,
    lead,
    leadMessage,
    marketingAccount,
    creativeAsset,
    billing,
    job,
    stripeEvent,
    providerLimit,
    providerEvent,
    userCredit,
    userCreditLedger,
  };
}

async function main() {
  const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const anon = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const fixtures = {
    orgIds: [],
    campaignIds: [],
    leadIds: [],
    leadMessageIds: [],
    marketingAccountIds: [],
    creativeAssetIds: [],
    billingIds: [],
    jobIds: [],
    stripeEventIds: [],
    providerLimitIds: [],
    providerEventIds: [],
    userCreditUserIds: [],
    userCreditLedgerIds: [],
  };
  const authUserIds = [];

  try {
    const tenantA = await createTenant(admin, "a");
    const tenantB = await createTenant(admin, "b");
    for (const tenant of [tenantA, tenantB]) {
      authUserIds.push(tenant.userId);
      fixtures.orgIds.push(tenant.org.id);
      fixtures.campaignIds.push(tenant.campaign.id);
      fixtures.leadIds.push(tenant.lead.id);
      fixtures.leadMessageIds.push(tenant.leadMessage.id);
      fixtures.marketingAccountIds.push(tenant.marketingAccount.id);
      fixtures.creativeAssetIds.push(tenant.creativeAsset.id);
      fixtures.billingIds.push(tenant.billing.id);
      fixtures.jobIds.push(tenant.job.id);
      fixtures.stripeEventIds.push(tenant.stripeEvent.id);
      fixtures.providerLimitIds.push(tenant.providerLimit.id);
      fixtures.providerEventIds.push(tenant.providerEvent.id);
      fixtures.userCreditUserIds.push(tenant.userCredit.user_id);
      fixtures.userCreditLedgerIds.push(tenant.userCreditLedger.id);
    }

    let jwtA;
    let jwtB;

    try {
      jwtA = await signIn(anon, tenantA.email);
      jwtB = await signIn(anon, tenantB.email);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/captcha/i.test(message)) {
        throw error;
      }

      jwtA = await createFixtureSession(admin, anon, tenantA.email);
      jwtB = await createFixtureSession(admin, anon, tenantB.email);
      console.log("INFO  Public password sign-in is CAPTCHA-protected; using admin-generated fixture sessions for RLS smoke.");
    }

    await expectMutationHidden({
      jwt: jwtA,
      table: "campaign_plans",
      id: tenantB.campaign.id,
      patch: { status: tenantB.campaign.status },
    });
    await expectMutationHidden({
      jwt: jwtB,
      table: "campaign_plans",
      id: tenantA.campaign.id,
      patch: { status: tenantA.campaign.status },
    });
    await expectMutationHidden({
      jwt: jwtA,
      table: "leads",
      id: tenantB.lead.id,
      patch: { status: tenantB.lead.status },
    });
    await expectMutationHidden({
      jwt: jwtB,
      table: "system_jobs",
      id: tenantA.job.id,
      patch: { status: tenantA.job.status },
    });
    await expectMembershipSelfJoinBlocked({
      jwt: jwtA,
      organizationId: tenantB.org.id,
      userId: tenantA.userId,
    });

    const result = spawnSync(process.execPath, ["./scripts/check-rls-cross-tenant.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RLS_USER_A_JWT: jwtA,
        RLS_USER_B_JWT: jwtB,
        RLS_SYSTEM_JOBS_INTERNAL_ONLY: "true",
        RLS_ORG_A_ID: tenantA.org.id,
        RLS_ORG_B_ID: tenantB.org.id,
        RLS_CAMPAIGN_A_ID: tenantA.campaign.id,
        RLS_CAMPAIGN_B_ID: tenantB.campaign.id,
        RLS_LEAD_A_ID: tenantA.lead.id,
        RLS_LEAD_B_ID: tenantB.lead.id,
        RLS_SYSTEM_JOB_A_ID: tenantA.job.id,
        RLS_SYSTEM_JOB_B_ID: tenantB.job.id,
        RLS_LEAD_MESSAGE_A_ID: tenantA.leadMessage.id,
        RLS_LEAD_MESSAGE_B_ID: tenantB.leadMessage.id,
        RLS_MARKETING_ACCOUNT_A_ID: tenantA.marketingAccount.id,
        RLS_MARKETING_ACCOUNT_B_ID: tenantB.marketingAccount.id,
        RLS_CREATIVE_ASSET_A_ID: tenantA.creativeAsset.id,
        RLS_CREATIVE_ASSET_B_ID: tenantB.creativeAsset.id,
        RLS_BILLING_SUBSCRIPTION_A_ID: tenantA.billing.id,
        RLS_BILLING_SUBSCRIPTION_B_ID: tenantB.billing.id,
        RLS_STRIPE_WEBHOOK_EVENT_A_ID: tenantA.stripeEvent.id,
        RLS_STRIPE_WEBHOOK_EVENT_B_ID: tenantB.stripeEvent.id,
        RLS_PROVIDER_USAGE_LIMIT_A_ID: tenantA.providerLimit.id,
        RLS_PROVIDER_USAGE_LIMIT_B_ID: tenantB.providerLimit.id,
        RLS_PROVIDER_USAGE_EVENT_A_ID: tenantA.providerEvent.id,
        RLS_PROVIDER_USAGE_EVENT_B_ID: tenantB.providerEvent.id,
        RLS_USER_CREDIT_A_ID: tenantA.userCredit.user_id,
        RLS_USER_CREDIT_B_ID: tenantB.userCredit.user_id,
        RLS_USER_CREDIT_LEDGER_A_ID: tenantA.userCreditLedger.id,
        RLS_USER_CREDIT_LEDGER_B_ID: tenantB.userCreditLedger.id,
        RLS_META_LAUNCH_LOCK_A_ID: tenantA.campaign.id,
        RLS_META_LAUNCH_LOCK_B_ID: tenantB.campaign.id,
      },
      encoding: "utf8",
      stdio: "inherit",
    });

    if (result.status !== 0) {
      throw new Error(`RLS cross-tenant smoke failed with exit code ${result.status}`);
    }

    console.log("PASS  Cross-tenant mutation denial - campaign, lead, and system job writes are blocked across tenants");
    console.log("PASS  Membership self-join denial - users cannot insert themselves into another organization");
  } finally {
    await cleanup(admin, fixtures, authUserIds);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
