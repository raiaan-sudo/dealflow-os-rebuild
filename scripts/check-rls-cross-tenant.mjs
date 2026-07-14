#!/usr/bin/env node

import nextEnv from "@next/env";
import { createHash } from "node:crypto";

const IS_ISOLATED_STAGING_PROOF =
  process.env.DEALFLOW_DEPLOYMENT_TARGET === "staging";
if (!IS_ISOLATED_STAGING_PROOF) {
  nextEnv.loadEnvConfig(process.cwd());
}

const EXPECTED_STAGING_PROJECT_FINGERPRINT =
  "c4d7f6ba9f2c678101b45b453998c4fa5755d8ec038f6cfd3ca8de957a0d1f4c";

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "RLS_USER_A_JWT",
  "RLS_USER_B_JWT",
];

let failures = 0;
let runnableChecks = 0;

function pass(name, detail = "") {
  console.log(`PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name, detail = "") {
  console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  failures += 1;
}

function warn(name, detail = "") {
  console.log(`WARN  ${name}${detail ? ` - ${detail}` : ""}`);
}

function env(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requireEnv() {
  const missing = requiredEnv.filter((name) => !env(name));

  if (missing.length > 0) {
    fail("RLS smoke env", `missing ${missing.join(", ")}`);
    process.exitCode = 1;
    return false;
  }

  if (IS_ISOLATED_STAGING_PROOF) {
    let projectRef = null;
    try {
      const hostname = new URL(env("NEXT_PUBLIC_SUPABASE_URL")).hostname.toLowerCase();
      projectRef = /^([a-z0-9-]+)\.supabase\.co$/.exec(hostname)?.[1] ?? null;
    } catch {
      projectRef = null;
    }
    if (
      !projectRef?.endsWith("qibh") ||
      createHash("sha256").update(projectRef ?? "").digest("hex") !==
        EXPECTED_STAGING_PROJECT_FINGERPRINT
    ) {
      fail("RLS smoke env", "not bound to the exact isolated staging project");
      process.exitCode = 1;
      return false;
    }
  }

  return true;
}

function supabaseUrl(path) {
  return `${env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "")}${path}`;
}

async function supabaseRequest(path, jwt, init = {}) {
  const headers = {
    apikey: env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    ...init.headers,
  };

  if (jwt) {
    headers.Authorization = `Bearer ${jwt}`;
  }

  return fetch(supabaseUrl(path), {
    ...init,
    headers,
  });
}

async function selectById({ table, id, columns, jwt }) {
  return selectByColumn({ table, column: "id", value: id, columns, jwt });
}

async function selectByColumn({ table, column, value, columns, jwt }) {
  const response = await supabaseRequest(
    `/rest/v1/${table}?${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}&select=${encodeURIComponent(columns)}`,
    jwt,
  );
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${text}`);
  }

  return Array.isArray(data) ? data : [];
}

async function expectVisible(name, params) {
  runnableChecks += 1;

  try {
    const rows = await selectByColumn({
      column: params.idColumn ?? "id",
      value: params.id,
      ...params,
    });

    if (rows.length === 1) {
      pass(name, `${params.table} row is visible to its owner/member token`);
    } else {
      fail(name, `expected 1 row, got ${rows.length}`);
    }
  } catch (error) {
    fail(name, error instanceof Error ? error.message : "query failed");
  }
}

async function expectHidden(name, params) {
  runnableChecks += 1;

  try {
    const rows = await selectByColumn({
      column: params.idColumn ?? "id",
      value: params.id,
      ...params,
    });

    if (rows.length === 0) {
      pass(name, `${params.table} row is hidden from the other tenant token`);
    } else {
      fail(name, `expected 0 rows, got ${rows.length}`);
    }
  } catch (error) {
    fail(name, error instanceof Error ? error.message : "query failed");
  }
}

async function expectDenied(name, params) {
  runnableChecks += 1;

  const response = await supabaseRequest(
    `/rest/v1/${params.table}?${encodeURIComponent(params.idColumn ?? "id")}=eq.${encodeURIComponent(params.id)}&select=${encodeURIComponent(params.columns)}`,
    params.jwt,
  );

  if ([401, 403, 404].includes(response.status)) {
    pass(name, `${params.table} denied with ${response.status}`);
    return;
  }

  const text = await response.text();
  fail(name, `expected denial, got ${response.status} ${text}`);
}

async function expectRpcDenied(name, jwt) {
  runnableChecks += 1;

  const response = await supabaseRequest("/rest/v1/rpc/consume_rate_limit_bucket", jwt, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_bucket_key: `rls-smoke-${crypto.randomUUID()}`,
      p_max_requests: 1,
      p_window_ms: 60_000,
    }),
  });

  if ([401, 403, 404].includes(response.status)) {
    pass(name, `consume_rate_limit_bucket denied with ${response.status}`);
  } else {
    const text = await response.text();
    fail(name, `expected RPC denial, got ${response.status} ${text}`);
  }
}

async function runPair({
  table,
  label,
  columns,
  userAIdEnv,
  userBIdEnv,
  idColumn = "id",
}) {
  const userAId = env(userAIdEnv);
  const userBId = env(userBIdEnv);

  if (!userAId || !userBId) {
    warn(`${label} RLS`, `set ${userAIdEnv} and ${userBIdEnv} to verify this table`);
    return;
  }

  await expectVisible(`${label}: User A sees own row`, {
    table,
    id: userAId,
    idColumn,
    columns,
    jwt: env("RLS_USER_A_JWT"),
  });
  await expectHidden(`${label}: User A cannot see User B row`, {
    table,
    id: userBId,
    idColumn,
    columns,
    jwt: env("RLS_USER_A_JWT"),
  });
  await expectVisible(`${label}: User B sees own row`, {
    table,
    id: userBId,
    idColumn,
    columns,
    jwt: env("RLS_USER_B_JWT"),
  });
  await expectHidden(`${label}: User B cannot see User A row`, {
    table,
    id: userAId,
    idColumn,
    columns,
    jwt: env("RLS_USER_B_JWT"),
  });
}

async function main() {
  if (!requireEnv()) {
    return;
  }

  await runPair({
    table: "organizations",
    label: "Organizations",
    columns: "id,owner_user_id",
    userAIdEnv: "RLS_ORG_A_ID",
    userBIdEnv: "RLS_ORG_B_ID",
  });
  await runPair({
    table: "campaign_plans",
    label: "Campaign plans",
    columns: "id,user_id,owner_id,organization_id",
    userAIdEnv: "RLS_CAMPAIGN_A_ID",
    userBIdEnv: "RLS_CAMPAIGN_B_ID",
  });
  await runPair({
    table: "leads",
    label: "Leads",
    columns: "id,user_id,organization_id,campaign_id",
    userAIdEnv: "RLS_LEAD_A_ID",
    userBIdEnv: "RLS_LEAD_B_ID",
  });
  if (env("RLS_SYSTEM_JOBS_INTERNAL_ONLY") === "true") {
    const systemJobAId = env("RLS_SYSTEM_JOB_A_ID");
    const systemJobBId = env("RLS_SYSTEM_JOB_B_ID");
    if (systemJobAId && systemJobBId) {
      await expectDenied("System jobs: User A denied from internal table", {
        table: "system_jobs",
        id: systemJobAId,
        columns: "id,user_id,organization_id,campaign_id,kind",
        jwt: env("RLS_USER_A_JWT"),
      });
      await expectDenied("System jobs: User A denied from User B internal row", {
        table: "system_jobs",
        id: systemJobBId,
        columns: "id,user_id,organization_id,campaign_id,kind",
        jwt: env("RLS_USER_A_JWT"),
      });
      await expectDenied("System jobs: User B denied from internal table", {
        table: "system_jobs",
        id: systemJobBId,
        columns: "id,user_id,organization_id,campaign_id,kind",
        jwt: env("RLS_USER_B_JWT"),
      });
      await expectDenied("System jobs: User B denied from User A internal row", {
        table: "system_jobs",
        id: systemJobAId,
        columns: "id,user_id,organization_id,campaign_id,kind",
        jwt: env("RLS_USER_B_JWT"),
      });
    } else {
      warn("System jobs RLS", "set RLS_SYSTEM_JOB_A_ID and RLS_SYSTEM_JOB_B_ID to verify this table");
    }
  } else {
    await runPair({
      table: "system_jobs",
      label: "System jobs",
      columns: "id,user_id,organization_id,campaign_id,kind",
      userAIdEnv: "RLS_SYSTEM_JOB_A_ID",
      userBIdEnv: "RLS_SYSTEM_JOB_B_ID",
    });
  }
  await runPair({
    table: "lead_messages",
    label: "Lead messages",
    columns: "id,lead_id,direction",
    userAIdEnv: "RLS_LEAD_MESSAGE_A_ID",
    userBIdEnv: "RLS_LEAD_MESSAGE_B_ID",
  });
  await runPair({
    table: "marketing_accounts",
    label: "Marketing accounts",
    columns: "id,organization_id,platform,status",
    userAIdEnv: "RLS_MARKETING_ACCOUNT_A_ID",
    userBIdEnv: "RLS_MARKETING_ACCOUNT_B_ID",
  });
  await runPair({
    table: "creative_assets",
    label: "Creative assets",
    columns: "id,user_id,campaign_id,status",
    userAIdEnv: "RLS_CREATIVE_ASSET_A_ID",
    userBIdEnv: "RLS_CREATIVE_ASSET_B_ID",
  });
  await runPair({
    table: "billing_subscriptions",
    label: "Billing subscriptions",
    columns: "id,user_id,organization_id,status",
    userAIdEnv: "RLS_BILLING_SUBSCRIPTION_A_ID",
    userBIdEnv: "RLS_BILLING_SUBSCRIPTION_B_ID",
  });
  await runPair({
    table: "stripe_webhook_events",
    label: "Stripe webhook events",
    columns: "id,organization_id,stripe_event_id,status",
    userAIdEnv: "RLS_STRIPE_WEBHOOK_EVENT_A_ID",
    userBIdEnv: "RLS_STRIPE_WEBHOOK_EVENT_B_ID",
  });
  await runPair({
    table: "provider_usage_limits",
    label: "Provider usage limits",
    columns: "id,user_id,organization_id,campaign_id,provider,operation",
    userAIdEnv: "RLS_PROVIDER_USAGE_LIMIT_A_ID",
    userBIdEnv: "RLS_PROVIDER_USAGE_LIMIT_B_ID",
  });
  await runPair({
    table: "provider_usage_events",
    label: "Provider usage events",
    columns: "id,user_id,organization_id,campaign_id,provider,operation,status",
    userAIdEnv: "RLS_PROVIDER_USAGE_EVENT_A_ID",
    userBIdEnv: "RLS_PROVIDER_USAGE_EVENT_B_ID",
  });
  await runPair({
    table: "organization_user_credits",
    label: "Organization user credits",
    columns: "organization_id,user_id,balance",
    userAIdEnv: "RLS_USER_CREDIT_A_ID",
    userBIdEnv: "RLS_USER_CREDIT_B_ID",
    idColumn: "user_id",
  });
  const legacyCreditAId = env("RLS_USER_CREDIT_A_ID");
  const legacyCreditBId = env("RLS_USER_CREDIT_B_ID");
  if (legacyCreditAId && legacyCreditBId) {
    await expectDenied("Legacy user credits: User A denied from frozen table", {
      table: "user_credits",
      id: legacyCreditAId,
      idColumn: "user_id",
      columns: "user_id,balance",
      jwt: env("RLS_USER_A_JWT"),
    });
    await expectDenied("Legacy user credits: User B denied from frozen table", {
      table: "user_credits",
      id: legacyCreditBId,
      idColumn: "user_id",
      columns: "user_id,balance",
      jwt: env("RLS_USER_B_JWT"),
    });
  }
  await runPair({
    table: "user_credit_ledger",
    label: "User credit ledger",
    columns: "id,user_id,organization_id,delta,balance_after,reason",
    userAIdEnv: "RLS_USER_CREDIT_LEDGER_A_ID",
    userBIdEnv: "RLS_USER_CREDIT_LEDGER_B_ID",
  });
  await runPair({
    table: "meta_launch_locks",
    label: "Meta launch locks",
    columns: "campaign_id,lock_token,locked_until",
    userAIdEnv: "RLS_META_LAUNCH_LOCK_A_ID",
    userBIdEnv: "RLS_META_LAUNCH_LOCK_B_ID",
    idColumn: "campaign_id",
  });

  await expectRpcDenied("Internal rate-limit RPC: anon denied", null);
  await expectRpcDenied("Internal rate-limit RPC: User A denied", env("RLS_USER_A_JWT"));
  await expectRpcDenied("Internal rate-limit RPC: User B denied", env("RLS_USER_B_JWT"));

  if (runnableChecks <= 3) {
    fail(
      "RLS row fixtures",
      "set at least one A/B row pair env var group, for example RLS_CAMPAIGN_A_ID and RLS_CAMPAIGN_B_ID",
    );
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("RLS smoke crashed", error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
