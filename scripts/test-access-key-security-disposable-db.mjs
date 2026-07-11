#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const containerName = `dealflow-access-key-security-${process.pid}-${randomBytes(4).toString("hex")}`;
const password = randomBytes(24).toString("hex");
const migrations = [
  "supabase/migrations/20260705090000_create_billing_access_keys.sql",
  "supabase/migrations/20260710235992_harden_access_key_reveal_claim.sql",
  "supabase/migrations/20260710235993_harden_access_key_claim_delivery.sql",
];
const ownerId = "00000000-0000-4000-8000-000000000001";
const otherUserId = "00000000-0000-4000-8000-000000000002";
const organizationId = "20000000-0000-4000-8000-000000000001";
const otherOrganizationId = "20000000-0000-4000-8000-000000000002";
let cleaned = false;

function docker(args, options = {}) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    input: options.input,
    timeout: options.timeout ?? 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function sanitize(value) {
  return String(value ?? "")
    .replaceAll(password, "[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .trim()
    .slice(-2_000);
}

function requireSuccess(result, label) {
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${sanitize(result.error?.message || result.stderr || result.stdout)}`);
  }
  return String(result.stdout ?? "").trim();
}

function psqlArgs() {
  return [
    "exec", "-i", "--env", `PGPASSWORD=${password}`, containerName,
    "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align",
    "--field-separator=|", "--quiet", "--username=supabase_admin", "--dbname=postgres",
  ];
}

function psqlRaw(sql) {
  return docker(psqlArgs(), { input: sql });
}

function psql(sql, label) {
  return requireSuccess(psqlRaw(sql), label);
}

function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", psqlArgs(), { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(sql);
  });
}

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  docker(["rm", "--force", containerName], { timeout: 30_000 });
}

for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.once(signal, () => {
    cleanup();
    process.exit(code);
  });
}
process.once("exit", cleanup);

async function waitForPostgres() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const initProcess = docker(
      ["exec", containerName, "cat", "/proc/1/comm"],
      { timeout: 5_000 },
    );
    const health = docker(
      ["inspect", "--format={{.State.Health.Status}}", containerName],
      { timeout: 5_000 },
    );
    const ready = docker(
      ["exec", containerName, "pg_isready", "--username=supabase_admin", "--dbname=postgres"],
      { timeout: 5_000 },
    );
    if (
      initProcess.status === 0 &&
      initProcess.stdout.trim().toLowerCase().includes("postgres") &&
      health.status === 0 &&
      health.stdout.trim() === "healthy" &&
      ready.status === 0
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Disposable PostgreSQL did not become ready within 30 seconds.");
}

try {
  for (const migration of migrations) {
    assert.ok(fs.existsSync(path.join(root, migration)), `Missing migration: ${migration}`);
  }
  requireSuccess(docker(["image", "inspect", image], { timeout: 15_000 }), "Cached image unavailable");
  requireSuccess(
    docker([
      "run", "--detach", "--rm", "--pull=never", "--network=none", "--name", containerName,
      "--env", `POSTGRES_PASSWORD=${password}`, image,
    ], { timeout: 30_000 }),
    "Disposable PostgreSQL failed to start",
  );
  await waitForPostgres();

  psql(`
    create schema if not exists private;
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end;
    $$;
    create table public.app_schema_metadata (
      key text primary key, value text not null,
      updated_at timestamptz not null default timezone('utc', now())
    );
    create table public.partners (id uuid primary key, slug text unique);
    create table public.organizations (
      id uuid primary key,
      owner_user_id uuid null references auth.users(id)
    );
    create table public.organization_memberships (
      organization_id uuid not null references public.organizations(id),
      user_id uuid not null references auth.users(id),
      primary key (organization_id, user_id)
    );
  `, "Synthetic prerequisites failed");
  for (const migration of migrations) {
    psql(fs.readFileSync(path.join(root, migration), "utf8"), `Apply ${migration}`);
  }

  assert.equal(
    psql(`select to_regprocedure('public.consume_billing_access_key_reveal(text,text)') is null;`, "Read retired reveal function"),
    "t",
  );
  assert.equal(
    psql(`select has_function_privilege('authenticated', 'public.begin_billing_access_key_reveal_delivery(text,text,text,integer)', 'EXECUTE');`, "Read reveal privilege"),
    "f",
  );
  assert.equal(
    psql(`select has_function_privilege('authenticated', 'public.preclaim_billing_access_key(text,text,text,text,timestamptz)', 'EXECUTE');`, "Read preclaim privilege"),
    "f",
  );
  assert.equal(
    psql(`select has_function_privilege('authenticated', 'public.claim_billing_access_key_reconciliation(text,uuid,uuid,text,integer)', 'EXECUTE');`, "Read claim privilege"),
    "f",
  );

  const revealId = "10000000-0000-4000-8000-000000000001";
  const preclaimId = "10000000-0000-4000-8000-000000000002";
  const recoveryId = "10000000-0000-4000-8000-000000000003";
  const revealVerifierHash = "a".repeat(64);
  const accessKeyHash = "b".repeat(64);
  psql(`
    insert into auth.users(id) values ('${ownerId}'), ('${otherUserId}');
    insert into public.organizations(id, owner_user_id) values
      ('${organizationId}', '${ownerId}'),
      ('${otherOrganizationId}', '${otherUserId}');
    insert into public.organization_memberships(organization_id, user_id) values
      ('${organizationId}', '${ownerId}'),
      ('${otherOrganizationId}', '${otherUserId}');
    insert into public.billing_access_keys(
      id, key_hash, key_prefix, status, stripe_checkout_session_id,
      stripe_subscription_id, plan_tier, expires_at,
      reveal_verifier_hash, reveal_verifier_expires_at, metadata
    ) values (
      '${revealId}', '${"c".repeat(64)}', 'df_live_reveal', 'active', 'cs_live_reveal',
      'sub_live_reveal', 'pro', now() + interval '1 day', '${revealVerifierHash}', now() + interval '1 day',
      '{"reveal_ciphertext":"encrypted-proof-only"}'::jsonb
    ), (
      '${preclaimId}', '${accessKeyHash}', 'df_live_claim', 'active', 'cs_live_claim',
      'sub_live_claim', 'pro', now() + interval '1 day', '${"d".repeat(64)}', now() + interval '1 day',
      '{"reveal_ciphertext":"encrypted-claim-proof"}'::jsonb
    );
  `, "Insert access-key fixtures");

  const revealSql = (deliveryTokenHash) => `
    set request.jwt.claim.role = 'service_role';
    select access_key_id, reveal_ciphertext, delivery_generation
    from public.begin_billing_access_key_reveal_delivery(
      'cs_live_reveal', '${revealVerifierHash}', '${deliveryTokenHash}', 60000
    );
  `;
  const firstDeliveryHash = "4".repeat(64);
  const secondDeliveryHash = "5".repeat(64);
  const revealResults = await Promise.all([
    psqlAsync(revealSql(firstDeliveryHash)),
    psqlAsync(revealSql(secondDeliveryHash)),
  ]);
  for (const result of revealResults) {
    assert.equal(result.status, 0, sanitize(result.stderr));
  }
  const revealLines = revealResults
    .flatMap((result) => result.stdout.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean);
  assert.deepEqual(revealLines, [`${revealId}|encrypted-proof-only|1`]);
  const winningDeliveryHash = psql(
    `select reveal_delivery_token_hash from public.billing_access_keys where id = '${revealId}';`,
    "Read first reveal delivery owner",
  );
  assert.ok([firstDeliveryHash, secondDeliveryHash].includes(winningDeliveryHash));
  assert.equal(
    psql(`
      select reveal_consumed_at is null, reveal_verifier_hash is not null,
        metadata ? 'reveal_ciphertext', reveal_delivery_token_hash is not null
      from public.billing_access_keys where id = '${revealId}';
    `, "Read unacknowledged reveal delivery"),
    "t|t|t|t",
    "Beginning a reveal deleted the only recoverable ciphertext",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.release_billing_access_key_reveal_delivery(
        'cs_live_reveal', '${winningDeliveryHash}'
      );
    `, "Release interrupted reveal delivery"),
    "t",
  );
  const retryDeliveryHash = "6".repeat(64);
  assert.equal(
    psql(revealSql(retryDeliveryHash), "Retry released reveal delivery"),
    `${revealId}|encrypted-proof-only|2`,
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.ack_billing_access_key_reveal_delivery(
        'cs_live_reveal', '${retryDeliveryHash}'
      );
    `, "Acknowledge reveal delivery"),
    "acknowledged",
  );
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.ack_billing_access_key_reveal_delivery(
        'cs_live_reveal', '${retryDeliveryHash}'
      );
    `, "Replay reveal acknowledgement"),
    "already_acknowledged",
  );
  assert.equal(
    psql(`
      select reveal_consumed_at is not null, reveal_verifier_hash is null,
        metadata ? 'reveal_ciphertext', reveal_ack_token_hash = '${retryDeliveryHash}'
      from public.billing_access_keys where id = '${revealId}';
    `, "Read acknowledged reveal settlement"),
    "t|t|f|t",
  );

  const preclaimSql = (email, tokenHash) => `
    set request.jwt.claim.role = 'service_role';
    select id, preclaimed_email
    from public.preclaim_billing_access_key(
      '${accessKeyHash}', '${email}', null, '${tokenHash}', now() + interval '24 hours'
    );
  `;
  const preclaimResults = await Promise.all([
    psqlAsync(preclaimSql("first@example.test", "e".repeat(64))),
    psqlAsync(preclaimSql("second@example.test", "f".repeat(64))),
  ]);
  for (const result of preclaimResults) {
    assert.equal(result.status, 0, sanitize(result.stderr));
  }
  const preclaimLines = preclaimResults
    .flatMap((result) => result.stdout.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean);
  assert.equal(preclaimLines.length, 1, "two concurrent buyers both acquired the same access key");
  const winnerEmail = preclaimLines[0].split("|")[1];
  assert.ok(["first@example.test", "second@example.test"].includes(winnerEmail));
  assert.equal(
    psql(preclaimSql("third@example.test", "1".repeat(64)), "Reject active preclaim replacement"),
    "",
  );
  assert.equal(
    psql(preclaimSql(winnerEmail, "1".repeat(64)), "Recover same-email preclaim after signup failure"),
    `${preclaimId}|${winnerEmail}`,
    "A same-email signup retry could not rotate its claim token",
  );
  assert.equal(
    psql(`select preclaimed_email, status, claim_token_hash from public.billing_access_keys where id = '${preclaimId}';`, "Read preclaim winner"),
    `${winnerEmail}|preclaimed|${"1".repeat(64)}`,
  );
  psql(`
    update public.billing_access_keys
    set claim_token_expires_at = now() - interval '1 second'
    where id = '${preclaimId}';
  `, "Expire preclaim fixture");
  assert.equal(
    psql(preclaimSql("replacement@example.test", "2".repeat(64)), "Replace expired preclaim"),
    `${preclaimId}|replacement@example.test`,
  );

  const finalClaimTokenHash = "2".repeat(64);
  const claimSql = (userId, workspaceId, email) => `
    set request.jwt.claim.role = 'service_role';
    select public.claim_billing_access_key_reconciliation(
      '${finalClaimTokenHash}', '${userId}', '${workspaceId}', '${email}', 60000
    ) ->> 'outcome';
  `;
  assert.equal(
    psql(claimSql(ownerId, organizationId, "wrong@example.test"), "Reject claim email mismatch"),
    "email_mismatch",
  );
  const concurrentClaimResults = await Promise.all([
    psqlAsync(claimSql(ownerId, organizationId, "replacement@example.test")),
    psqlAsync(claimSql(ownerId, organizationId, "replacement@example.test")),
  ]);
  for (const result of concurrentClaimResults) {
    assert.equal(result.status, 0, sanitize(result.stderr));
  }
  const claimOutcomes = concurrentClaimResults
    .flatMap((result) => result.stdout.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
  assert.deepEqual(
    claimOutcomes,
    ["acquired", "in_progress"],
    "Concurrent claimers shared or replaced the same live reconciliation lease",
  );
  assert.equal(
    psql(claimSql(otherUserId, otherOrganizationId, "replacement@example.test"), "Reject claimed workspace replacement"),
    "claim_identity_mismatch",
  );
  const [firstLeaseToken, firstLeaseGeneration] = psql(`
    select claim_reconciliation_lease_token, claim_reconciliation_generation
    from public.billing_access_keys where id = '${preclaimId}';
  `, "Read first claim reconciliation lease").split("|");
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.fail_billing_access_key_reconciliation(
        '${preclaimId}', '${ownerId}', '${organizationId}',
        '${firstLeaseToken}', ${firstLeaseGeneration}, 'offline_provider_failure'
      );
    `, "Release failed claim reconciliation"),
    "t",
  );
  assert.equal(
    psql(`
      select claim_reconciliation_status, claim_token_hash is not null,
        claimed_by_user_id, claimed_organization_id
      from public.billing_access_keys where id = '${preclaimId}';
    `, "Read recoverable failed claim"),
    `failed|t|${ownerId}|${organizationId}`,
  );
  assert.equal(
    psql(claimSql(ownerId, organizationId, "replacement@example.test"), "Reclaim failed reconciliation"),
    "recovered",
  );
  const [replacementLeaseToken, replacementLeaseGeneration] = psql(`
    select claim_reconciliation_lease_token, claim_reconciliation_generation
    from public.billing_access_keys where id = '${preclaimId}';
  `, "Read replacement claim reconciliation lease").split("|");
  assert.equal(Number(replacementLeaseGeneration), Number(firstLeaseGeneration) + 1);
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.complete_billing_access_key_reconciliation(
        '${preclaimId}', '${ownerId}', '${organizationId}',
        '${replacementLeaseToken}', ${replacementLeaseGeneration},
        '{"provider_sync_status":"completed"}'::jsonb
      );
    `, "Complete replacement reconciliation"),
    "t",
  );
  assert.equal(
    psql(`
      select claim_reconciliation_status, claim_token_hash is null,
        claim_reconciliation_lease_token is null
      from public.billing_access_keys where id = '${preclaimId}';
    `, "Read completed claim reconciliation"),
    "completed|t|t",
  );

  psql(`
    insert into public.billing_access_keys(
      id, key_hash, key_prefix, status, stripe_checkout_session_id,
      stripe_subscription_id, plan_tier, expires_at, preclaimed_email,
      claimed_by_user_id, claimed_organization_id, claimed_at,
      claim_reconciliation_status, metadata
    ) values (
      '${recoveryId}', '${"7".repeat(64)}', 'df_live_recover', 'claimed',
      'cs_live_recover', 'sub_live_recover', 'pro', now() + interval '1 day',
      'replacement@example.test', '${ownerId}', '${organizationId}', now(),
      'failed', '{"provider_sync_status":"failed"}'::jsonb
    );
  `, "Insert token-cleared recovery fixture");
  assert.equal(
    psql(`
      set request.jwt.claim.role = 'service_role';
      select public.claim_billing_access_key_reconciliation(
        '${"8".repeat(64)}', '${ownerId}', '${organizationId}',
        'replacement@example.test', 60000
      ) ->> 'outcome';
    `, "Recover token-cleared exact workspace claim"),
    "recovered",
    "An exact user/workspace provider failure could not recover after its old token was cleared",
  );

  console.log("PASS access-key disposable DB: recoverable reveal delivery, first-preclaim fencing, and exact workspace claim reconciliation");
} finally {
  cleanup();
}
