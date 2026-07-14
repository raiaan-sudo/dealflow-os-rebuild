#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

import {
  RLS_FIXTURE_DIRECT_MARKERS,
  applyRlsFixtureMarker,
  isRlsFixtureAuthEmail,
} from "./lib/rls-fixture-contract.mjs";

const IS_ISOLATED_STAGING_PROOF =
  process.env.DEALFLOW_DEPLOYMENT_TARGET === "staging";
if (!IS_ISOLATED_STAGING_PROOF) {
  nextEnv.loadEnvConfig(process.cwd());
}

const EXPECTED_STAGING_PROJECT_FINGERPRINT =
  "c4d7f6ba9f2c678101b45b453998c4fa5755d8ec038f6cfd3ca8de957a0d1f4c";

const stamp = Date.now();

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function assertExactIsolatedStagingProject() {
  if (!IS_ISOLATED_STAGING_PROOF) return;
  const hostname = new URL(requireEnv("NEXT_PUBLIC_SUPABASE_URL")).hostname.toLowerCase();
  const projectRef = /^([a-z0-9-]+)\.supabase\.co$/.exec(hostname)?.[1];
  const fingerprint = projectRef
    ? createHash("sha256").update(projectRef).digest("hex")
    : null;
  if (
    !projectRef?.endsWith("qibh") ||
    fingerprint !== EXPECTED_STAGING_PROJECT_FINGERPRINT
  ) {
    throw new Error("RLS fixture proof is not bound to the exact isolated staging project");
  }
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

async function selectRows(query, context) {
  const { data, error } = await query;
  assertNoError(error, context);
  return data ?? [];
}

async function validatePreauthenticatedJwt(anon, jwt, expectedUserId, expectedEmail) {
  if (typeof jwt !== "string" || jwt.length < 100) {
    throw new Error(`preauthenticated fixture session is missing for ${expectedEmail}`);
  }
  const { data, error } = await anon.auth.getUser(jwt);
  assertNoError(error, `validate preauthenticated fixture session ${expectedEmail}`);
  if (
    data.user?.id !== expectedUserId ||
    data.user?.email?.trim().toLowerCase() !== expectedEmail
  ) {
    throw new Error(`preauthenticated fixture session identity mismatch for ${expectedEmail}`);
  }
  return jwt;
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
    ["meta_launch_locks", "campaign_id", fixtures.campaignIds],
    ["lead_messages", "id", fixtures.leadMessageIds],
    ["creative_assets", "id", fixtures.creativeAssetIds],
    ["marketing_accounts", "id", fixtures.marketingAccountIds],
    ["billing_subscriptions", "id", fixtures.billingIds],
    ["system_jobs", "id", fixtures.jobIds],
    ["leads", "id", fixtures.leadIds],
    ["campaign_plans", "id", fixtures.campaignIds],
    ["organization_memberships", "organization_id", fixtures.orgIds],
    ["organizations", "id", fixtures.orgIds],
    ["users", "id", fixtures.userIds],
  ];
  const failures = [];

  for (const [table, column, ids] of deletes) {
    if (ids.length === 0) {
      continue;
    }
    try {
      const { error } = await admin.from(table).delete().in(column, ids);
      if (error) failures.push(`clean up ${table}: ${error.message}`);
    } catch (error) {
      failures.push(`clean up ${table}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const userId of authUserIds) {
    try {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) failures.push(`clean up auth user ${userId}: ${error.message}`);
    } catch (error) {
      failures.push(
        `clean up auth user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `RLS fixture cleanup attempted every tracked resource and failed ${failures.length} operation(s): ${failures.join(" | ")}`,
    );
  }
}

function emptyFixtures() {
  return {
    userIds: [],
    orgIds: [],
    campaignIds: [],
    leadIds: [],
    leadMessageIds: [],
    marketingAccountIds: [],
    creativeAssetIds: [],
    billingIds: [],
    jobIds: [],
  };
}

async function listAllAuthUsers(admin) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    assertNoError(error, `list auth users page ${page}`);
    users.push(...data.users);
    if (data.users.length < 200) return users;
  }
}

async function cleanupStaleRlsFixtures(admin) {
  const fixtures = emptyFixtures();
  const authUsers = (await listAllAuthUsers(admin)).filter((user) =>
    isRlsFixtureAuthEmail(user.email),
  );
  const authUserIds = authUsers.map((user) => user.id);
  for (const marker of RLS_FIXTURE_DIRECT_MARKERS) {
    if (!marker.fixtureKey) continue;
    const rows = await selectRows(
      applyRlsFixtureMarker(admin.from(marker.table).select("id"), marker),
      `discover stale RLS ${marker.key}`,
    );
    fixtures[marker.fixtureKey].push(...rows.map((row) => row.id));
  }
  await cleanup(admin, fixtures, authUserIds);
}

async function loadCanonicalTenant(admin, suffix, userId, organizationId) {
  const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId);
  assertNoError(authError, `read canonical auth user ${suffix}`);
  const email = authData.user?.email?.trim().toLowerCase();
  if (!email) {
    throw new Error(`read canonical auth user ${suffix}: missing email`);
  }

  const publicUsers = await selectRows(
    admin.from("users").select("id,email").eq("id", userId),
    `read canonical public user ${suffix}`,
  );
  const organizations = await selectRows(
    admin.from("organizations").select("id,owner_user_id").eq("id", organizationId),
    `read canonical organization ${suffix}`,
  );
  const memberships = await selectRows(
    admin
      .from("organization_memberships")
      .select("organization_id,user_id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId),
    `read canonical organization membership ${suffix}`,
  );
  if (
    publicUsers.length !== 1 ||
    publicUsers[0].id !== userId ||
    publicUsers[0].email?.toLowerCase() !== email ||
    organizations.length !== 1 ||
    organizations[0].id !== organizationId ||
    memberships.length !== 1 ||
    memberships[0].organization_id !== organizationId ||
    memberships[0].user_id !== userId
  ) {
    throw new Error(`canonical RLS tenant ${suffix} is not exactly bound`);
  }

  return {
    userId,
    email,
    org: organizations[0],
  };
}

async function loadCanonicalImmutableFixtures(admin, identityA, identityB) {
  const expected = [
    {
      suffix: "a",
      identity: identityA,
      stripeId: requireEnv("RLS_CANONICAL_STRIPE_EVENT_A_ID"),
      providerLimitId: requireEnv("RLS_CANONICAL_PROVIDER_LIMIT_A_ID"),
      providerEventId: requireEnv("RLS_CANONICAL_PROVIDER_EVENT_A_ID"),
    },
    {
      suffix: "b",
      identity: identityB,
      stripeId: requireEnv("RLS_CANONICAL_STRIPE_EVENT_B_ID"),
      providerLimitId: requireEnv("RLS_CANONICAL_PROVIDER_LIMIT_B_ID"),
      providerEventId: requireEnv("RLS_CANONICAL_PROVIDER_EVENT_B_ID"),
    },
  ];
  const allIds = expected.flatMap((fixture) => [
    fixture.stripeId,
    fixture.providerLimitId,
    fixture.providerEventId,
  ]);
  if (new Set(allIds).size !== allIds.length) {
    throw new Error("canonical immutable RLS fixture ids must be distinct");
  }

  const loaded = {};
  for (const fixture of expected) {
    const stripeRows = await selectRows(
      admin
        .from("stripe_webhook_events")
        .select("id,organization_id,status,payload")
        .eq("id", fixture.stripeId),
      `read canonical Stripe RLS fixture ${fixture.suffix}`,
    );
    const providerLimitRows = await selectRows(
      admin
        .from("provider_usage_limits")
        .select("id,organization_id,user_id,campaign_id,provider,operation,usage_count,limit_count")
        .eq("id", fixture.providerLimitId),
      `read canonical provider-limit RLS fixture ${fixture.suffix}`,
    );
    const providerEventRows = await selectRows(
      admin
        .from("provider_usage_events")
        .select("id,organization_id,user_id,campaign_id,provider,operation,status,metadata,credit_ledger_id,compensation_ledger_id")
        .eq("id", fixture.providerEventId),
      `read canonical provider-event RLS fixture ${fixture.suffix}`,
    );
    const stripe = stripeRows[0];
    const providerLimit = providerLimitRows[0];
    const providerEvent = providerEventRows[0];
    if (
      stripeRows.length !== 1 ||
      providerLimitRows.length !== 1 ||
      providerEventRows.length !== 1 ||
      stripe.organization_id !== fixture.identity.organizationId ||
      stripe.status !== "processed" ||
      stripe.payload?.synthetic !== true ||
      providerLimit.organization_id !== fixture.identity.organizationId ||
      providerLimit.user_id !== fixture.identity.userId ||
      providerLimit.campaign_id !== null ||
      providerLimit.usage_count !== 1 ||
      providerLimit.limit_count !== 1 ||
      providerEvent.organization_id !== fixture.identity.organizationId ||
      providerEvent.user_id !== fixture.identity.userId ||
      providerEvent.campaign_id !== null ||
      providerEvent.provider !== providerLimit.provider ||
      providerEvent.operation !== providerLimit.operation ||
      providerEvent.status !== "consumed" ||
      providerEvent.metadata?.synthetic !== true ||
      providerEvent.metadata?.providerMutationPerformed !== false ||
      providerEvent.credit_ledger_id !== null ||
      providerEvent.compensation_ledger_id !== null
    ) {
      throw new Error(`canonical immutable RLS fixture ${fixture.suffix} is not exactly bound`);
    }
    loaded[fixture.suffix] = { stripe, providerLimit, providerEvent };
  }
  return loaded;
}

async function createTenantFixtures(admin, suffix, fixtures, identity) {
  const tenant = await loadCanonicalTenant(
    admin,
    suffix,
    identity.userId,
    identity.organizationId,
  );
  const { userId, email, org } = tenant;

  const campaignId = rowId();
  fixtures.campaignIds.push(campaignId);
  const { data: campaignRows, error: campaignError } = await admin.rpc(
    "create_campaign_plan_with_entitlement_v1",
    {
      p_campaign_id: campaignId,
      p_organization_id: identity.organizationId,
      p_user_id: userId,
      p_plan: {
        fixture: true,
        suffix,
        business_name: `RLS Fixture Business ${suffix}`,
        client_name: `RLS Fixture Client ${suffix}`,
        industry: "Security fixture",
        location: "Test",
        budget: "100",
      },
      p_launch_status: "ready",
      p_lead_loop_verified: false,
      p_public_slug: `rls-fixture-${stamp}-${suffix}`,
    },
  );
  assertNoError(campaignError, "create campaign through entitlement authority");
  const campaign = Array.isArray(campaignRows) ? campaignRows[0] : campaignRows;
  if (
    !campaign ||
    campaign.id !== campaignId ||
    campaign.organization_id !== identity.organizationId ||
    campaign.user_id !== userId
  ) {
    throw new Error("campaign entitlement authority returned an invalid tenant binding");
  }

  const leadId = rowId();
  fixtures.leadIds.push(leadId);
  const lead = await insertOne(admin, "leads", {
    id: leadId,
    organization_id: identity.organizationId,
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

  const leadMessageId = rowId();
  fixtures.leadMessageIds.push(leadMessageId);
  const leadMessage = await insertOne(admin, "lead_messages", {
    id: leadMessageId,
    lead_id: lead.id,
    direction: "inbound",
    message: `RLS fixture message ${suffix}`,
    provider_message_id: `rls-fixture-message-${stamp}-${suffix}`,
  });

  const marketingAccountId = rowId();
  fixtures.marketingAccountIds.push(marketingAccountId);
  const marketingAccount = await insertOne(admin, "marketing_accounts", {
    id: marketingAccountId,
    organization_id: identity.organizationId,
    name: `RLS Fixture Meta ${suffix}`,
    platform: "meta_ads",
    status: "connected",
    account_name: `RLS Fixture Meta ${suffix}`,
    external_account_id: `act_rls_${stamp}_${suffix}`,
    pixel_id: `pixel_rls_${stamp}_${suffix}`,
  });

  const creativeAssetId = rowId();
  fixtures.creativeAssetIds.push(creativeAssetId);
  const creativeAsset = await insertOne(admin, "creative_assets", {
    id: creativeAssetId,
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

  let billing;
  if (identity.billingId) {
    const billingRows = await selectRows(
      admin
        .from("billing_subscriptions")
        .select("*")
        .eq("id", identity.billingId)
        .eq("organization_id", identity.organizationId)
        .eq("user_id", userId),
      `read canonical billing subscription ${suffix}`,
    );
    if (billingRows.length !== 1) {
      throw new Error(`canonical billing subscription ${suffix} is not exactly bound`);
    }
    billing = billingRows[0];
  } else {
    const billingId = rowId();
    fixtures.billingIds.push(billingId);
    billing = await insertOne(admin, "billing_subscriptions", {
      id: billingId,
      organization_id: identity.organizationId,
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
  }

  const jobId = rowId();
  fixtures.jobIds.push(jobId);
  const job = await insertOne(admin, "system_jobs", {
    id: jobId,
    organization_id: identity.organizationId,
    user_id: userId,
    campaign_id: campaign.id,
    kind: "rls_fixture",
    status: "pending",
    payload: { fixture: true, suffix },
    max_attempts: 1,
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
  };
}

async function main() {
  assertExactIsolatedStagingProject();
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

  const fixtures = emptyFixtures();
  const authUserIds = [];
  let primaryError = null;

  try {
    await cleanupStaleRlsFixtures(admin);
    const identityA = {
      userId: requireEnv("RLS_CANONICAL_CREDIT_A_USER_ID"),
      organizationId: requireEnv("RLS_CANONICAL_ORGANIZATION_A_ID"),
      billingId: requireEnv("RLS_CANONICAL_BILLING_A_ID"),
    };
    const identityB = {
      userId: requireEnv("RLS_CANONICAL_CREDIT_B_USER_ID"),
      organizationId: requireEnv("RLS_CANONICAL_ORGANIZATION_B_ID"),
    };
    if (
      identityA.userId === identityB.userId ||
      identityA.organizationId === identityB.organizationId
    ) {
      throw new Error("canonical RLS tenants must be distinct");
    }
    const immutableFixtures = await loadCanonicalImmutableFixtures(admin, identityA, identityB);
    const tenantA = await createTenantFixtures(admin, "a", fixtures, identityA);
    const tenantB = await createTenantFixtures(admin, "b", fixtures, identityB);

    const jwtA = await validatePreauthenticatedJwt(
      anon,
      requireEnv("RLS_USER_A_JWT"),
      tenantA.userId,
      tenantA.email,
    );
    const jwtB = await validatePreauthenticatedJwt(
      anon,
      requireEnv("RLS_USER_B_JWT"),
      tenantB.userId,
      tenantB.email,
    );
    console.log("INFO  Reusing identity-validated, non-delivery in-memory sessions for canonical synthetic staging users.");

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
        RLS_STRIPE_WEBHOOK_EVENT_A_ID: immutableFixtures.a.stripe.id,
        RLS_STRIPE_WEBHOOK_EVENT_B_ID: immutableFixtures.b.stripe.id,
        RLS_PROVIDER_USAGE_LIMIT_A_ID: immutableFixtures.a.providerLimit.id,
        RLS_PROVIDER_USAGE_LIMIT_B_ID: immutableFixtures.b.providerLimit.id,
        RLS_PROVIDER_USAGE_EVENT_A_ID: immutableFixtures.a.providerEvent.id,
        RLS_PROVIDER_USAGE_EVENT_B_ID: immutableFixtures.b.providerEvent.id,
        RLS_USER_CREDIT_A_ID: requireEnv("RLS_CANONICAL_CREDIT_A_USER_ID"),
        RLS_USER_CREDIT_B_ID: requireEnv("RLS_CANONICAL_CREDIT_B_USER_ID"),
        RLS_USER_CREDIT_LEDGER_A_ID: requireEnv("RLS_CANONICAL_CREDIT_A_LEDGER_ID"),
        RLS_USER_CREDIT_LEDGER_B_ID: requireEnv("RLS_CANONICAL_CREDIT_B_LEDGER_ID"),
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
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      await cleanup(admin, fixtures, authUserIds);
    } catch (cleanupError) {
      if (primaryError) {
        throw new AggregateError(
          [primaryError, cleanupError],
          "RLS proof failed and fixture cleanup also failed",
        );
      }
      throw cleanupError;
    }
  }
  if (primaryError) throw primaryError;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
