#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createNativePostgresTestAdapter,
  sanitizePostgresDiagnostic,
} from "./lib/native-postgres-test-adapter.mjs";

function parseArgs(argv) {
  const supported = new Set(["--pgbin", "--host", "--port", "--user"]);
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!supported.has(key) || value === undefined || value.startsWith("--")) {
      throw new Error(
        "Usage: node scripts/test-native-postgres-test-adapter.mjs " +
          "--pgbin ABSOLUTE_BIN_DIR --host ABSOLUTE_SOCKET_DIR --port PORT --user USER",
      );
    }
    values[key.slice(2)] = value;
  }
  for (const key of ["pgbin", "host", "port", "user"]) {
    if (!values[key]) throw new Error(`Missing required --${key} argument`);
  }
  return values;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const databasePrefix = `dfn_${process.pid}_${randomBytes(3).toString("hex")}`;
  const adapter = createNativePostgresTestAdapter({
    ...options,
    databasePrefix,
    expectedVersion: "17.6",
  });
  const competingAdapter = createNativePostgresTestAdapter({
    ...options,
    databasePrefix,
    expectedVersion: "17.6",
  });

  assert.throws(
    () =>
      createNativePostgresTestAdapter({
        ...options,
        host: "127.0.0.1",
        databasePrefix: "df_refuse_tcp",
      }),
    /Unix-socket directory|TCP hosts are refused/,
  );

  const sanitized = sanitizePostgresDiagnostic(
    "postgresql://operator:secret@example.invalid/live PGPASSWORD=hunter2 password=hidden " +
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
  );
  assert.doesNotMatch(sanitized, /operator:secret|hunter2|hidden|eyJhbGci/);
  assert.match(sanitized, /REDACTED_DATABASE_URL/);
  assert.match(sanitized, /PGPASSWORD=\[REDACTED\]/);

  const preflight = adapter.preflight();
  assert.equal(preflight.versionNumber, "170006");
  assert.match(preflight.serverVersion, /^17\.6(?:\s|$)/);
  assert.equal(preflight.listenAddresses, "");
  assert.equal(preflight.socketPermissions, "0700");
  assert.deepEqual(adapter.listDisposableDatabases(), []);

  const uncertainPrefix = `dfu_${process.pid}_${randomBytes(3).toString("hex")}`;
  const wrapperBin = fs.mkdtempSync(path.join(os.tmpdir(), "dealflow-createdb-uncertain-"));
  try {
    for (const binary of ["dropdb", "pg_isready", "postgres", "psql"]) {
      fs.symlinkSync(path.join(options.pgbin, binary), path.join(wrapperBin, binary));
    }
    const realCreatedb = path.join(options.pgbin, "createdb");
    const quotedCreatedb = `'${realCreatedb.replaceAll("'", `'\"'\"'`)}'`;
    fs.writeFileSync(
      path.join(wrapperBin, "createdb"),
      `#!/bin/sh\n${quotedCreatedb} "$@" || exit $?\nexit 75\n`,
      { encoding: "utf8", mode: 0o700 },
    );
    const uncertainAdapter = createNativePostgresTestAdapter({
      ...options,
      pgbin: wrapperBin,
      databasePrefix: uncertainPrefix,
      expectedVersion: "17.6",
    });
    assert.throws(
      () => uncertainAdapter.startDisposableDatabase(),
      /Create disposable PostgreSQL database|status 75/i,
      "uncertain createdb failure must be surfaced after absence reconciliation",
    );
    assert.deepEqual(
      uncertainAdapter.listDisposableDatabases(),
      [],
      "uncertain createdb failure left an orphan disposable database",
    );
    const recoveredAdapter = createNativePostgresTestAdapter({
      ...options,
      databasePrefix: uncertainPrefix,
      expectedVersion: "17.6",
    });
    await recoveredAdapter.withDisposableDatabase(async (database) => {
      assert.equal(database.psql("select current_database();"), database.database);
    });
    assert.deepEqual(recoveredAdapter.listDisposableDatabases(), []);
  } finally {
    fs.rmSync(wrapperBin, { recursive: true, force: true });
  }

  let successDatabase;
  const successRole = `${databasePrefix}_success_role`;
  const concurrentUnrelatedRole = `unrelated_${process.pid}_${randomBytes(3).toString("hex")}`;
  let concurrentUnrelatedRoleCreated = false;
  let successResult;
  try {
    successResult = await adapter.withDisposableDatabase(async (database) => {
      successDatabase = database.database;
      assert.throws(
        () => competingAdapter.startDisposableDatabase(),
        /already owned|stale-lock/i,
        "same-prefix adapter must be rejected before database creation while the owner is active",
      );

      const identity = database.psql(
        `select current_database(), current_user,
              current_setting('listen_addresses'),
              coalesce(inet_client_addr()::text, ''),
              coalesce(inet_server_addr()::text, '');`,
        { label: "Verify disposable database identity" },
      );
      assert.equal(
        identity,
        `${database.database}|${options.user}|||`,
        "Disposable database did not use the expected Unix-only identity",
      );

      const roles = database.psql(
        `select string_agg(
                rolname || ':' || rolcanlogin::text || ':' || rolbypassrls::text,
                ',' order by rolname
              )
         from pg_roles
        where rolname in ('anon', 'authenticated', 'service_role');`,
        { label: "Verify Supabase-compatible roles" },
      );
      assert.equal(
        roles,
        "anon:false:false,authenticated:false:false,service_role:false:true",
      );

      const schemas = database.psql(
        `select string_agg(nspname, ',' order by nspname)
         from pg_namespace
        where nspname in ('auth', 'extensions');`,
        { label: "Verify Supabase-compatible schemas" },
      );
      assert.equal(schemas, "auth,extensions");

      const extension = database.psql(
        `select extension.extname, namespace.nspname
         from pg_extension extension
         join pg_namespace namespace on namespace.oid = extension.extnamespace
        where extension.extname = 'pgcrypto';`,
        { label: "Verify pgcrypto bootstrap" },
      );
      assert.equal(extension, "pgcrypto|extensions");

      const claims = database.psql(
        `with configured as (
         select
           set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false),
           set_config('request.jwt.claim.role', 'authenticated', false),
           set_config('request.jwt.claim.email', 'synthetic@example.invalid', false),
           set_config('request.jwt.claims', '{"synthetic":true}', false)
       )
       select auth.uid(), auth.role(), auth.email(), auth.jwt()->>'synthetic'
         from configured;`,
        { label: "Verify synthetic auth claim helpers" },
      );
      assert.equal(
        claims,
        "10000000-0000-4000-8000-000000000001|authenticated|synthetic@example.invalid|true",
      );

      database.psql(`create role "${successRole}" nologin;`, {
        label: "Create adapter-prefixed role cleanup probe",
      });
      adapter.psql(`create role "${concurrentUnrelatedRole}" nologin;`, {
        label: "Create concurrent unrelated cluster role preservation probe",
      });
      concurrentUnrelatedRoleCreated = true;

      database.psql(
        `create table public.native_adapter_probe (
         id integer primary key,
         marker text not null check (marker like 'synthetic-%')
       );`,
        { label: "Create synthetic concurrency probe" },
      );

      const concurrent = await database.psqlConcurrent(
        [1, 2, 3, 4].map(
          (id) =>
            `insert into public.native_adapter_probe(id, marker)
           values (${id}, 'synthetic-worker-${id}');
           select pg_sleep(0.05), ${id};`,
        ),
        { label: "Run synthetic concurrent inserts" },
      );
      assert.equal(concurrent.length, 4);
      assert.equal(
        database.psql("select count(*) from public.native_adapter_probe;", {
          label: "Count concurrent synthetic inserts",
        }),
        "4",
      );

      const duplicateDiagnostic = database.psqlMustFail(
        "insert into public.native_adapter_probe(id, marker) values (1, 'synthetic-duplicate');",
        /duplicate key value violates unique constraint/i,
        { label: "Verify expected database rejection" },
      );
      assert.match(duplicateDiagnostic, /duplicate key value violates unique constraint/i);
      return { concurrentClients: concurrent.length };
    });

    assert.equal(successResult.concurrentClients, 4);
    assert.ok(successDatabase);
    assert.equal(adapter.databaseExists(successDatabase), false);
    assert.equal(
      adapter.psql(`select exists(select 1 from pg_roles where rolname = '${successRole}');`),
      "f",
    );
    assert.equal(
      adapter.psql(
        `select exists(select 1 from pg_roles where rolname = '${concurrentUnrelatedRole}');`,
      ),
      "t",
      "adapter cleanup deleted an unrelated role created while the disposable session was active",
    );
    let competingDatabase;
    await competingAdapter.withDisposableDatabase(async (database) => {
      competingDatabase = database.database;
      assert.equal(database.psql("select current_database();"), competingDatabase);
    });
    assert.equal(competingAdapter.databaseExists(competingDatabase), false);
  } finally {
    if (concurrentUnrelatedRoleCreated) {
      adapter.psql(`drop role if exists "${concurrentUnrelatedRole}";`, {
        label: "Remove concurrent unrelated role preservation probe",
      });
    }
  }

  let failureDatabase;
  const failureRole = `${databasePrefix}_failure_role`;
  await assert.rejects(
    adapter.withDisposableDatabase(async (database) => {
      failureDatabase = database.database;
      database.psql(
        `create table public.synthetic_failure_probe(id integer primary key);
         create role "${failureRole}" nologin;`,
        { label: "Create synthetic failure cleanup probe" },
      );
      throw new Error("synthetic callback failure");
    }),
    /synthetic callback failure/,
  );
  assert.ok(failureDatabase);
  assert.equal(adapter.databaseExists(failureDatabase), false);
  assert.equal(
    adapter.psql(`select exists(select 1 from pg_roles where rolname = '${failureRole}');`),
    "f",
  );
  await adapter.withDisposableDatabase(async (database) => {
    assert.equal(database.psql("select current_database();"), database.database);
  });
  assert.deepEqual(adapter.listDisposableDatabases(), []);

  console.log(
    "Native PostgreSQL adapter self-test passed: exact 17.6, Unix socket only, " +
      "Supabase bootstrap, four concurrent clients, sanitized diagnostics, " +
      "owned-role cleanup, concurrent unrelated-role preservation, and zero leftover databases.",
  );
}

main().catch((error) => {
  console.error(`Native PostgreSQL adapter self-test failed: ${sanitizePostgresDiagnostic(error)}`);
  process.exitCode = 1;
});
