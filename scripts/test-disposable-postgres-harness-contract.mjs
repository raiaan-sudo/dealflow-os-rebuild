#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertDisposablePostgresCleanupResult,
  createDisposablePostgresHarness,
  nativeCompatiblePostgresUsername,
} from "./lib/disposable-postgres-harness.mjs";
import {
  acquireNativePostgresPrefixLock,
  releaseNativePostgresPrefixLock,
  selectNativePostgresOwnedRolesForCleanup,
} from "./lib/native-postgres-test-adapter.mjs";
import { requireFinalVerificationNativeEnvironment } from "./lib/final-verification-environment.mjs";

const root = process.cwd();
const modeName = "DEALFLOW_DISPOSABLE_DB_MODE";
const nativeNames = [
  "DEALFLOW_NATIVE_PGBIN",
  "DEALFLOW_NATIVE_PGHOST",
  "DEALFLOW_NATIVE_PGPORT",
  "DEALFLOW_NATIVE_PGUSER",
];
const allModeNames = [modeName, ...nativeNames];
const originalEnvironment = new Map(
  allModeNames.map((name) => [name, process.env[name]]),
);

const validFinalEnvironment = {
  DEALFLOW_DISPOSABLE_DB_MODE: "native",
  DEALFLOW_NATIVE_PGBIN: "/private/tmp/postgres/bin",
  DEALFLOW_NATIVE_PGHOST: "/private/tmp/postgres/socket",
  DEALFLOW_NATIVE_PGPORT: "55432",
  DEALFLOW_NATIVE_PGUSER: "supabase_admin",
};
assert.deepEqual(requireFinalVerificationNativeEnvironment(validFinalEnvironment), {
  mode: "native",
  pgbin: "/private/tmp/postgres/bin",
  host: "/private/tmp/postgres/socket",
  port: "55432",
  user: "supabase_admin",
});
assert.throws(
  () => requireFinalVerificationNativeEnvironment({ ...validFinalEnvironment, DEALFLOW_DISPOSABLE_DB_MODE: "docker" }),
  /requires DEALFLOW_DISPOSABLE_DB_MODE=native/,
);

assert.equal(
  nativeCompatiblePostgresUsername("postgres", "supabase_admin"),
  "supabase_admin",
  "Docker's default postgres connection must map to the configured native superuser",
);
assert.equal(
  nativeCompatiblePostgresUsername("supabase_admin", "local_test_superuser"),
  "local_test_superuser",
  "Supabase image owner connections must map to the configured native superuser",
);
assert.equal(
  nativeCompatiblePostgresUsername("authenticated", "supabase_admin"),
  "authenticated",
  "non-superuser role simulations must remain exact",
);
for (const missing of nativeNames) {
  const environment = { ...validFinalEnvironment };
  delete environment[missing];
  assert.throws(
    () => requireFinalVerificationNativeEnvironment(environment),
    new RegExp(missing),
  );
}
assert.throws(
  () => requireFinalVerificationNativeEnvironment({ ...validFinalEnvironment, DEALFLOW_NATIVE_PGPORT: "80" }),
  /1024 through 65535/,
);
assert.throws(
  () =>
    requireFinalVerificationNativeEnvironment({
      ...validFinalEnvironment,
      DEALFLOW_NATIVE_PGUSER: "local_test_superuser",
    }),
  /DEALFLOW_NATIVE_PGUSER=supabase_admin/,
  "canonical final verification must preserve the frozen Supabase owner identity",
);
assert.throws(
  () => requireFinalVerificationNativeEnvironment({ ...validFinalEnvironment, DEALFLOW_NATIVE_PGHOST: "relative/socket" }),
  /absolute DEALFLOW_NATIVE_PGHOST/,
);
for (const [name, value] of [
  ["DEALFLOW_NATIVE_PGBIN", "/private/tmp/postgres 17/bin"],
  ["DEALFLOW_NATIVE_PGBIN", "/private/tmp/postgres\u00a017/bin"],
  ["DEALFLOW_NATIVE_PGHOST", "/private/tmp/postgres\nsocket"],
]) {
  assert.throws(
    () =>
      requireFinalVerificationNativeEnvironment({
        ...validFinalEnvironment,
        [name]: value,
      }),
    /without whitespace or control characters/,
  );
}

assert.equal(
  assertDisposablePostgresCleanupResult({ error: undefined, status: 0, stderr: "", stdout: "removed\n" }).status,
  0,
);
assert.throws(
  () => assertDisposablePostgresCleanupResult({ error: undefined, status: 1, stderr: "synthetic cleanup failure", stdout: "" }),
  /Disposable PostgreSQL cleanup failed: synthetic cleanup failure/,
  "normal-path cleanup failure must be test-fatal",
);

assert.deepEqual(
  selectNativePostgresOwnedRolesForCleanup({
    roleNames: [
      "anon",
      "authenticated",
      "service_role",
      "dfh_contract_owned",
      "dfh_contract_second",
      "concurrent_unrelated_role",
      "shared_operator",
    ],
    databasePrefix: "dfh_contract",
    createdBootstrapRoles: ["anon", "service_role"],
  }),
  ["anon", "dfh_contract_owned", "dfh_contract_second", "service_role"],
  "cleanup selection must include only explicitly created bootstrap roles and strict adapter-prefix roles",
);
assert.throws(
  () =>
    selectNativePostgresOwnedRolesForCleanup({
      roleNames: ["concurrent_unrelated_role"],
      databasePrefix: "dfh_contract",
      createdBootstrapRoles: ["concurrent_unrelated_role"],
    }),
  /unrecognized owned bootstrap role/,
  "arbitrary roles cannot be promoted into the adapter-owned bootstrap set",
);

const lockHost = fs.mkdtempSync(path.join(os.tmpdir(), "dealflow-native-lock-contract-"));
fs.chmodSync(lockHost, 0o700);
try {
  const firstLock = acquireNativePostgresPrefixLock({
    host: lockHost,
    port: 55432,
    databasePrefix: "dfh_contract",
  });
  assert.throws(
    () =>
      acquireNativePostgresPrefixLock({
        host: lockHost,
        port: 55432,
        databasePrefix: "dfh_contract",
      }),
    /already owned|stale-lock/i,
    "same-cluster same-prefix concurrency must fail closed",
  );
  const differentPrefixLock = acquireNativePostgresPrefixLock({
    host: lockHost,
    port: 55432,
    databasePrefix: "dfh_other",
  });
  const differentPortLock = acquireNativePostgresPrefixLock({
    host: lockHost,
    port: 55433,
    databasePrefix: "dfh_contract",
  });
  assert.equal(releaseNativePostgresPrefixLock(differentPrefixLock), true);
  assert.equal(releaseNativePostgresPrefixLock(differentPortLock), true);
  assert.equal(releaseNativePostgresPrefixLock(firstLock), true);
  const reacquiredLock = acquireNativePostgresPrefixLock({
    host: lockHost,
    port: 55432,
    databasePrefix: "dfh_contract",
  });
  assert.equal(releaseNativePostgresPrefixLock(reacquiredLock), true);

  const replacedLock = acquireNativePostgresPrefixLock({
    host: lockHost,
    port: 55434,
    databasePrefix: "dfh_contract",
  });
  fs.rmdirSync(replacedLock.path);
  fs.mkdirSync(replacedLock.path, { mode: 0o700 });
  assert.throws(
    () => releaseNativePostgresPrefixLock(replacedLock),
    /identity changed/i,
    "a replaced lock directory must never be released by the old owner token",
  );
  fs.rmdirSync(replacedLock.path);
} finally {
  fs.rmSync(lockHost, { recursive: true, force: true });
}

function restoreEnvironment() {
  for (const [name, value] of originalEnvironment) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

try {
  for (const name of allModeNames) delete process.env[name];

  const dockerDefault = createDisposablePostgresHarness({
    containerName: "dealflow-static-contract",
    image: "synthetic-postgres:17.6",
  });
  assert.equal(dockerDefault.mode, "docker", "Docker must remain the canonical default");

  assert.throws(
    () =>
      createDisposablePostgresHarness({
        containerName: "../unsafe",
        image: "synthetic-postgres:17.6",
      }),
    /container name is invalid/,
  );
  assert.throws(
    () =>
      createDisposablePostgresHarness({
        containerName: "dealflow-static-contract",
        image: "synthetic-postgres:17.6",
        maxBuffer: 1,
      }),
    /maxBuffer/,
  );

  process.env[modeName] = "unsupported";
  assert.throws(
    () =>
      createDisposablePostgresHarness({
        containerName: "dealflow-static-contract",
        image: "synthetic-postgres:17.6",
      }),
    /must be docker or native/,
  );

  process.env[modeName] = "native";
  assert.throws(
    () =>
      createDisposablePostgresHarness({
        containerName: "dealflow-static-contract",
        image: "synthetic-postgres:17.6",
      }),
    /DEALFLOW_NATIVE_PGBIN/,
  );
} finally {
  restoreEnvironment();
}

const databaseScripts = [
  "test-access-key-security-disposable-db.mjs",
  "test-campaign-entitlement-disposable-db.mjs",
  "test-creative-lead-disposable-db.mjs",
  "test-financial-integrity-disposable-db.mjs",
  "test-ghl-disposable-db.mjs",
  "test-lead-effect-fencing-disposable-db.mjs",
  "test-meta-leadgen-disposable-db.mjs",
  "test-scheduler-disposable-db.mjs",
  "test-sms-receipt-hardening.mjs",
  "test-stripe-webhook-disposable-db.mjs",
  "test-support-outbox-disposable-db.mjs",
];

assert.equal(databaseScripts.length, 11);
for (const script of databaseScripts) {
  const source = fs.readFileSync(path.join(root, "scripts", script), "utf8");
  assert.match(
    source,
    /createDisposablePostgresHarness/,
    `${script} does not use the shared disposable PostgreSQL harness`,
  );
  assert.doesNotMatch(
    source,
    /(?:spawn|spawnSync)\("docker"/,
    `${script} still starts Docker directly`,
  );
  assert.doesNotMatch(
    source,
    /from "node:child_process"/,
    `${script} still imports direct child-process transport`,
  );
  assert.match(
    source,
    /"--network=none"/,
    `${script} does not preserve network-disabled database isolation`,
  );
}

const runner = fs.readFileSync(
  path.join(root, "scripts/run-dealflow-final-verification.mjs"),
  "utf8",
);
for (const name of allModeNames) {
  assert.match(
    runner,
    new RegExp(`["']${name}["']`),
    `final verification does not forward ${name}`,
  );
}
assert.doesNotMatch(
  runner,
  /DEALFLOW_NATIVE_(?:PGPASSWORD|DATABASE_URL|SECRET|TOKEN)/,
  "final verification must not forward native PostgreSQL secrets",
);
assert.match(runner, /requireFinalVerificationNativeEnvironment\(process\.env\)/);
assert.doesNotMatch(
  runner,
  /DEALFLOW_DISPOSABLE_DB_MODE === "native"\s*\?/, 
  "native adapter self-test must be unconditional in the canonical final runner",
);

const adapterSource = fs.readFileSync(
  path.join(root, "scripts/lib/native-postgres-test-adapter.mjs"),
  "utf8",
);
assert.match(adapterSource, /expectedVersion = "17\.6"/);
assert.match(adapterSource, /TCP hosts are refused/);
assert.match(adapterSource, /listen_addresses/);
assert.match(adapterSource, /Unix-socket permissions/);
assert.match(adapterSource, /Refusing PostgreSQL database not owned by this adapter/);
assert.match(adapterSource, /selectNativePostgresOwnedRolesForCleanup/);
assert.match(adapterSource, /acquireNativePostgresPrefixLock/);
assert.match(adapterSource, /releaseNativePostgresPrefixLock/);
assert.doesNotMatch(
  adapterSource,
  /filter\(\(role\) => !baselineRoles\.has\(role\)\)/,
  "native cleanup must never treat every post-baseline cluster role as adapter-owned",
);

console.log(
  "Disposable PostgreSQL harness contract passed: Docker default, 11 shared-harness integrations, " +
    "network-disabled launches, exact native opt-in settings, Unix-only PostgreSQL 17.6 gates, " +
    "and adapter-owned role cleanup fencing.",
);
