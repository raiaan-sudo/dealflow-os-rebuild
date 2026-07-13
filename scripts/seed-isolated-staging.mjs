#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const FIXTURE_LABEL = "DF-STAGING-20260712";
const IDS = Object.freeze({
  organization: "d1000000-0000-4000-8000-000000000001",
  membership: "d1000000-0000-4000-8000-000000000002",
  campaign: "d2000000-0000-4000-8000-000000000001",
  lead: "d3000000-0000-4000-8000-000000000001",
  leadMessage: "d3000000-0000-4000-8000-000000000002",
  marketingAccount: "d4000000-0000-4000-8000-000000000001",
  creativeAsset: "d5000000-0000-4000-8000-000000000001",
  billing: "d6000000-0000-4000-8000-000000000001",
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

function assertIsolatedStaging(url) {
  if (!["staging", "preview", "test"].includes(process.env.DEALFLOW_DEPLOYMENT_TARGET ?? "")) {
    throw new Error("An explicit nonproduction DealFlow deployment target is required");
  }
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("The staging fixture seeder is disabled in Vercel production");
  }
  const actual = projectRef(url);
  const expected = requireEnvironment("STAGING_ISOLATED_SUPABASE_PROJECT_REF").toLowerCase();
  if (!actual || actual !== expected) {
    throw new Error("The Supabase project does not match the exact staging attestation");
  }
}

async function assertNoError(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function findAuthUser(admin, email) {
  for (let page = 1; page <= 5; page += 1) {
    const data = await assertNoError(
      await admin.auth.admin.listUsers({ page, perPage: 200 }),
      "list staging auth users",
    );
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  throw new Error("The staging auth-user search exceeded its bounded page limit");
}

async function upsert(admin, table, row, onConflict) {
  const query = admin.from(table).upsert(row, { onConflict }).select("*").single();
  return assertNoError(await query, `upsert ${table}`);
}

async function main() {
  const supabaseUrl = requireEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  assertIsolatedStaging(supabaseUrl);

  const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = requireEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const qaEmail = requireEnvironment("QA_EMAIL").toLowerCase();
  const qaPassword = requireEnvironment("STAGING_QA_PASSWORD");
  if (!qaEmail.includes("staging") || !qaEmail.endsWith("@example.com")) {
    throw new Error("QA_EMAIL must be a clearly labeled synthetic staging address at example.com");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let authUser = await findAuthUser(admin, qaEmail);
  if (!authUser) {
    const created = await assertNoError(
      await admin.auth.admin.createUser({
        email: qaEmail,
        password: qaPassword,
        email_confirm: true,
        user_metadata: { fixture: FIXTURE_LABEL, synthetic: true },
      }),
      "create staging auth user",
    );
    authUser = created.user;
  }
  if (!authUser?.id) throw new Error("The staging auth user has no id");

  const userId = authUser.id;
  await assertNoError(
    await admin.auth.admin.updateUserById(userId, { password: qaPassword, email_confirm: true }),
    "synchronize staging auth user",
  );
  await upsert(admin, "users", {
    id: userId,
    email: qaEmail,
    full_name: `${FIXTURE_LABEL} Realtor`,
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
    role: "member",
  }, "id");

  const qaClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await assertNoError(
    await qaClient.auth.signInWithPassword({ email: qaEmail, password: qaPassword }),
    "sign in staging realtor",
  );

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
    selected_ad_id: "static-problem-solution",
    selected_ad_ids: ["static-problem-solution"],
    campaign_payload: {
      selected_ad_id: "static-problem-solution",
      selected_ad_ids: ["static-problem-solution"],
    },
    launch_status: "ready",
    lead_loop_verified: true,
    public_slug: "df-staging-20260712-funnel",
  };
  await assertNoError(
    await admin.rpc("create_campaign_plan_with_entitlement_v1", {
      p_campaign_id: IDS.campaign,
      p_organization_id: IDS.organization,
      p_user_id: userId,
      p_plan: campaignPlan,
      p_launch_status: "ready",
      p_lead_loop_verified: true,
      p_public_slug: "df-staging-20260712-funnel",
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
    public_slug: "df-staging-20260712-funnel",
    publish_state: "published",
    launch_status: "ready",
    lead_loop_verified: true,
    published_snapshot: {
      fixture: FIXTURE_LABEL,
      name: `${FIXTURE_LABEL} Toronto Buyer Campaign`,
      headline: "Find your next Toronto home",
      offer: "Synthetic staging market guide",
    },
    published_at: new Date().toISOString(),
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
    platform: "meta",
    status: "connected",
    account_name: `${FIXTURE_LABEL} Meta Sandbox`,
    external_account_id: "act_df_staging_20260712",
    pixel_id: "pixel_df_staging_20260712",
    connection_metadata: { fixture: FIXTURE_LABEL, synthetic: true, execution_mode: "sandbox" },
  }, "id");

  await upsert(admin, "creative_assets", {
    id: IDS.creativeAsset,
    user_id: userId,
    campaign_id: IDS.campaign,
    creative_id: "df-staging-20260712-creative",
    asset_type: "image",
    format: "square",
    generation_method: "synthetic_staging",
    status: "ready",
    provider_name: "synthetic_staging",
    file_url: "/logo.svg",
    type: "image",
  }, "id");

  const stripeEventId = "evt_test_df_staging_20260712";
  await upsert(admin, "billing_subscriptions", {
    id: IDS.billing,
    organization_id: IDS.organization,
    user_id: userId,
    stripe_customer_id: "cus_test_df_staging_20260712",
    stripe_subscription_id: "sub_test_df_staging_20260712",
    stripe_price_id: "price_test_df_staging_20260712",
    plan_tier: "pro",
    status: "active",
    metadata: { fixture: FIXTURE_LABEL, synthetic: true, livemode: false },
    stripe_latest_event_id: stripeEventId,
    stripe_latest_event_created: 1_788_739_200,
  }, "id");

  await assertNoError(await admin.rpc("grant_user_credits", {
    p_user_id: userId,
    p_organization_id: IDS.organization,
    p_amount: 1000,
    p_reason: "synthetic_staging_enrollment",
    p_reference_type: "staging_fixture",
    p_reference_id: FIXTURE_LABEL,
    p_idempotency_key: "df-staging-20260712-credit",
    p_metadata: { fixture: FIXTURE_LABEL, synthetic: true },
  }), "grant staging enrollment credits");

  process.stdout.write(`${JSON.stringify({
    status: "SEEDED",
    fixture: FIXTURE_LABEL,
    projectRef: projectRef(supabaseUrl),
    userId,
    organizationId: IDS.organization,
    campaignId: IDS.campaign,
    leadId: IDS.lead,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
