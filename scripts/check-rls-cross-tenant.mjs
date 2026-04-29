#!/usr/bin/env node

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
  const response = await supabaseRequest(
    `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=${encodeURIComponent(columns)}`,
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
    const rows = await selectById(params);

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
    const rows = await selectById(params);

    if (rows.length === 0) {
      pass(name, `${params.table} row is hidden from the other tenant token`);
    } else {
      fail(name, `expected 0 rows, got ${rows.length}`);
    }
  } catch (error) {
    fail(name, error instanceof Error ? error.message : "query failed");
  }
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
    columns,
    jwt: env("RLS_USER_A_JWT"),
  });
  await expectHidden(`${label}: User A cannot see User B row`, {
    table,
    id: userBId,
    columns,
    jwt: env("RLS_USER_A_JWT"),
  });
  await expectVisible(`${label}: User B sees own row`, {
    table,
    id: userBId,
    columns,
    jwt: env("RLS_USER_B_JWT"),
  });
  await expectHidden(`${label}: User B cannot see User A row`, {
    table,
    id: userAId,
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
  await runPair({
    table: "system_jobs",
    label: "System jobs",
    columns: "id,user_id,organization_id,campaign_id,kind",
    userAIdEnv: "RLS_SYSTEM_JOB_A_ID",
    userBIdEnv: "RLS_SYSTEM_JOB_B_ID",
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
