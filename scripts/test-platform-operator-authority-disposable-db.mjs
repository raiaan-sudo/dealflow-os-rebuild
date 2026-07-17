#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDisposablePostgresHarness } from "./lib/disposable-postgres-harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260717030000_harden_platform_operator_authority.sql",
);
const migration = readFileSync(MIGRATION, "utf8");
const image = "postgres:17.6";
const containerName = `dealflow-platform-operator-${process.pid}-${randomBytes(3).toString("hex")}`;
const disposablePostgres = createDisposablePostgresHarness({ containerName, image });
const password = randomBytes(24).toString("hex");
let cleaned = false;

function docker(args, options = {}) {
  return disposablePostgres.run(args, options);
}

function sanitize(value) {
  return String(value ?? "")
    .replaceAll(password, "[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .trim()
    .slice(-4_000);
}

function requireSuccess(result, label) {
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${sanitize(result.error?.message || result.stderr || result.stdout)}`);
  }
  return String(result.stdout ?? "").trim();
}

function psqlRaw(sql) {
  return docker([
    "exec", "-i", "--env", `PGPASSWORD=${password}`, containerName,
    "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align",
    "--field-separator=|", "--quiet", "--username=postgres", "--dbname=postgres",
  ], { input: sql, timeout: 120_000 });
}

const session = {
  psql(sql, options = {}) {
    return requireSuccess(psqlRaw(sql), options.label ?? "PostgreSQL statement failed");
  },
  psqlMustFail(sql, pattern) {
    const result = psqlRaw(sql);
    if (!result.error && result.status === 0) {
      throw new Error("Rejected PostgreSQL statement unexpectedly succeeded");
    }
    const diagnostic = sanitize(result.stderr || result.stdout || result.error?.message);
    assert.match(diagnostic, pattern);
    return diagnostic;
  },
};

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  docker(["rm", "--force", containerName], { timeout: 30_000 });
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = docker(
      ["exec", containerName, "pg_isready", "--username=postgres", "--dbname=postgres"],
      { timeout: 5_000 },
    );
    if (ready.status === 0) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error("Disposable PostgreSQL 17.6 did not become ready within 30 seconds.");
}

const ids = Array.from({ length: 12 }, (_, index) =>
  `a1000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const COMMIT = "a".repeat(40);
const TREE = "b".repeat(40);
const CANDIDATE = "c".repeat(64);
const PACKET = "d".repeat(64);
const SIGNATURE = "signature/OWNER-ADMIN-SECURITY-SURFACE";

function service(sql) {
  return `set role service_role;
    set request.jwt.claim.role = 'service_role';
    ${sql}
    reset role;`;
}

function authenticated(sql) {
  return `set role authenticated;
    set request.jwt.claim.role = 'authenticated';
    ${sql}
    reset role;`;
}

function insertGrant({
  userId,
  role = "viewer",
  environment = "production",
  generation = 1,
  mode = "externally_signed",
  status = "active",
  signature = SIGNATURE,
  packet = PACKET,
  commit = COMMIT,
  tree = TREE,
  candidate = CANDIDATE,
  grantedAt = "now()",
  expiresAt = "null",
  revokedAt = "null",
  reason = "null",
}) {
  return `insert into public.platform_operator_grants (
      user_id, environment, operator_role, status, generation, authority_mode,
      signed_authority_ref, authority_packet_digest, candidate_commit,
      candidate_tree, candidate_digest, grant_digest, granted_at, expires_at,
      revoked_at, revocation_reason_code
    ) values (
      '${userId}', '${environment}', '${role}', '${status}', ${generation}, '${mode}',
      '${signature}', '${packet}', '${commit}', '${tree}', '${candidate}', repeat('0',64),
      ${grantedAt}, ${expiresAt}, ${revokedAt}, ${reason}
    );`;
}

function authorize({
  userId,
  environment = "production",
  action = "admin:read",
  issuedAt = "now()",
  aal = "aal2",
  commit = COMMIT,
  tree = TREE,
  candidate = CANDIDATE,
  packet = PACKET,
  signature = SIGNATURE,
}) {
  return service(`select operator_role || '|' || grant_generation::text || '|' ||
      case when receipt_digest ~ '^[0-9a-f]{64}$' then 'receipt' else 'invalid' end
    from public.authorize_platform_operator_access_v1(
      '${userId}', '${environment}', '${action}', ${issuedAt}, '${aal}',
      '${commit}', '${tree}', '${candidate}', '${packet}', '${signature}'
    );`);
}

try {
  requireSuccess(docker(["image", "inspect", image]), "Cached PostgreSQL 17.6 image unavailable");
  requireSuccess(
    docker([
      "run", "--detach", "--rm", "--pull=never", "--network=none", "--name", containerName,
      "--env", `POSTGRES_PASSWORD=${password}`, image,
    ], { timeout: 30_000 }),
    "Disposable PostgreSQL 17.6 failed to start",
  );
  await waitForPostgres();
  assert.match(session.psql("show server_version;"), /^17\.6\b/);

    session.psql(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
        if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
        if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
      end $$;
      create schema if not exists auth;
      create schema if not exists extensions;
      create extension if not exists pgcrypto with schema extensions;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.role() returns text language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
      create table public.app_schema_metadata (
        key text primary key, value text not null, updated_at timestamptz not null default now()
      );
      insert into auth.users(id) values ${ids.map((id) => `('${id}')`).join(",")};
      begin; set role postgres; ${migration} reset role; commit;
    `, { label: "Apply platform operator migration", timeoutMs: 120_000 });

    assert.equal(
      session.psql("select value from public.app_schema_metadata where key='schema_version';"),
      "20260717030000",
    );
    session.psqlMustFail(
      authenticated(`insert into public.platform_operator_grants (
        user_id,environment,operator_role,generation,authority_mode,signed_authority_ref,
        authority_packet_digest,candidate_commit,candidate_tree,candidate_digest,grant_digest
      ) values ('${ids[0]}','production','viewer',1,'externally_signed','${SIGNATURE}',
        '${PACKET}','${COMMIT}','${TREE}','${CANDIDATE}',repeat('0',64));`),
      /permission denied/i,
    );
    session.psqlMustFail(
      service("select count(*) from public.platform_operator_grants;"),
      /permission denied/i,
    );
    session.psqlMustFail(
      authenticated(`select * from public.authorize_platform_operator_access_v1(
        '${ids[0]}','production','admin:read',now(),'aal2','${COMMIT}','${TREE}',
        '${CANDIDATE}','${PACKET}','${SIGNATURE}');`),
      /permission denied/i,
    );

    session.psql(insertGrant({ userId: ids[0], role: "viewer" }));
    assert.equal(session.psql(authorize({ userId: ids[0] })), "viewer|1|receipt");
    session.psqlMustFail(
      authorize({ userId: ids[0], action: "access_keys:revoke" }),
      /platform_operator_role_action_denied/i,
    );
    session.psqlMustFail(
      authorize({ userId: ids[0], aal: "aal1" }),
      /platform_operator_recent_aal2_required/i,
    );
    session.psqlMustFail(
      authorize({ userId: ids[0], issuedAt: "now() - interval '11 minutes'" }),
      /platform_operator_recent_aal2_required/i,
    );
    session.psqlMustFail(
      authorize({ userId: ids[0], candidate: "e".repeat(64) }),
      /platform_operator_grant_not_found/i,
    );
    session.psqlMustFail(
      authorize({ userId: ids[0], packet: "e".repeat(64) }),
      /platform_operator_grant_not_found/i,
    );
    session.psqlMustFail(
      authorize({ userId: ids[0], signature: "signature/wrong" }),
      /platform_operator_grant_not_found/i,
    );
    session.psqlMustFail(
      authorize({ userId: ids[0], environment: "staging" }),
      /platform_operator_grant_not_found/i,
    );

    session.psql(insertGrant({ userId: ids[1], role: "security_admin" }));
    assert.equal(
      session.psql(authorize({ userId: ids[1], action: "access_keys:revoke" })),
      "security_admin|1|receipt",
    );

    session.psql(insertGrant({
      userId: ids[2], grantedAt: "now() - interval '2 hours'",
      expiresAt: "now() - interval '1 hour'",
    }));
    session.psqlMustFail(authorize({ userId: ids[2] }), /platform_operator_grant_expired/i);

    session.psql(insertGrant({
      userId: ids[3], status: "revoked", revokedAt: "now()",
      reason: "'owner_revoked'",
    }));
    session.psqlMustFail(authorize({ userId: ids[3] }), /platform_operator_grant_not_found/i);

    session.psql(insertGrant({ userId: ids[4], generation: 1 }));
    session.psql(insertGrant({ userId: ids[4], generation: 2 }));
    session.psqlMustFail(authorize({ userId: ids[4] }), /platform_operator_grant_ambiguous/i);

    session.psqlMustFail(
      insertGrant({
        userId: ids[5], role: "break_glass", expiresAt: "now() + interval '61 minutes'",
      }),
      /platform_operator_break_glass_maximum/i,
    );
    session.psql(insertGrant({
      userId: ids[5], role: "break_glass", expiresAt: "now() + interval '59 minutes'",
    }));
    assert.equal(
      session.psql(authorize({ userId: ids[5], action: "platform_grants:manage" })),
      "break_glass|1|receipt",
    );

    session.psqlMustFail(
      insertGrant({
        userId: ids[6], mode: "synthetic_staging", expiresAt: "now() + interval '1 hour'",
      }),
      /platform_operator_(?:synthetic_staging_only|production_external_only)/i,
    );
    const installSynthetic = (expiry = "now() + interval '1 hour'") => service(`
      select public.install_synthetic_staging_platform_operator_grant_v1(
        '${ids[6]}','security_admin',${expiry},'${COMMIT}','${TREE}','${CANDIDATE}',
        '${PACKET}','${SIGNATURE}'
      );`);
    assert.match(session.psql(installSynthetic()), /^[0-9a-f-]{36}$/i);
    assert.match(session.psql(installSynthetic()), /^[0-9a-f-]{36}$/i);
    assert.equal(
      session.psql(`select string_agg(status || ':' || generation::text, ',' order by generation)
        from public.platform_operator_grants where user_id='${ids[6]}';`),
      "revoked:1,active:2",
    );
    assert.equal(
      session.psql(service(`select operator_role || '|' || grant_generation::text
        from public.check_platform_operator_navigation_v1(
          '${ids[6]}','staging',now(),'aal2','${COMMIT}','${TREE}','${CANDIDATE}',
          '${PACKET}','${SIGNATURE}'
        );`)),
      "security_admin|2",
    );
    assert.equal(
      session.psql(`select count(*) from public.platform_operator_access_receipts receipt
        join public.platform_operator_grants grant_row on grant_row.id=receipt.grant_id
        where grant_row.user_id='${ids[6]}';`),
      "0",
      "navigation preflight must not manufacture a privileged-access receipt",
    );
    assert.equal(
      session.psql(authorize({
        userId: ids[6], environment: "staging", action: "security:write",
      })),
      "security_admin|2|receipt",
    );

    const receiptId = session.psql(
      "select id from public.platform_operator_access_receipts order by accessed_at limit 1;",
    );
    session.psqlMustFail(
      `update public.platform_operator_access_receipts set required_action='security:read'
        where id='${receiptId}';`,
      /platform_operator_receipt_immutable/i,
    );
    session.psqlMustFail(
      `delete from public.platform_operator_access_receipts where id='${receiptId}';`,
      /platform_operator_receipt_immutable/i,
    );
    session.psqlMustFail(
      `delete from public.platform_operator_grants where user_id='${ids[0]}';`,
      /platform_operator_grant_delete_forbidden_use_revocation/i,
    );
    assert.equal(
      session.psql(`select count(*) from information_schema.columns
        where table_schema='public' and table_name='platform_operator_access_receipts'
        and column_name ~ '(email|full_name|token|secret|signed_authority_ref)$';`),
      "0",
    );
    assert.equal(
      session.psql(`select count(*) from public.platform_operator_access_receipts
        where assurance_level <> 'aal2' or receipt_digest !~ '^[0-9a-f]{64}$'
          or actor_subject_digest !~ '^[0-9a-f]{64}$';`),
      "0",
    );
  console.log(
    "platform operator authority disposable PostgreSQL 17.6: PASS (direct mutation denied; exact grants, role/action, AAL2 freshness, environment/candidate binding, expiry, ambiguity, break-glass, synthetic staging, revocation, and immutable receipts proven)",
  );
} finally {
  cleanup();
}
