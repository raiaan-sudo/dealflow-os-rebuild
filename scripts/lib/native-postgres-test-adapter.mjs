import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REQUIRED_BINARIES = ["createdb", "dropdb", "pg_isready", "postgres", "psql"];
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAINTENANCE_DATABASE = "postgres";
const SAFE_IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]{2,62}$/;
const DATABASE_PREFIX_PATTERN = /^[a-z][a-z0-9_]{2,23}$/;
const BOOTSTRAP_ROLES = new Set(["anon", "authenticated", "service_role"]);

export class NativePostgresTestError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "NativePostgresTestError";
  }
}

export function sanitizePostgresDiagnostic(value) {
  const source = value instanceof Error ? value.message : String(value ?? "");
  return source
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(
      /\b(PGPASSWORD|DATABASE_URL|DIRECT_URL|SUPABASE_DB_URL)\s*[=:]\s*[^\s,;]+/gi,
      "$1=[REDACTED]",
    )
    .replace(/\b(password|passwd|pwd)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]")
    .trim()
    .slice(-4_000);
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new NativePostgresTestError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function expectedServerVersionNumber(version) {
  const match = /^(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new NativePostgresTestError(
      `Expected PostgreSQL version must use major.patch form, received ${version}`,
    );
  }
  return String(Number(match[1]) * 10_000 + Number(match[2])).padStart(6, "0");
}

function quoteIdentifier(identifier) {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new NativePostgresTestError("Refusing unsafe PostgreSQL identifier");
  }
  return `"${identifier}"`;
}

// PostgreSQL roles are cluster-wide. Never infer ownership merely because a
// role appeared after a disposable database started; another local process may
// have created it concurrently.
export function selectNativePostgresOwnedRolesForCleanup({
  roleNames,
  databasePrefix,
  createdBootstrapRoles = [],
}) {
  if (!Array.isArray(roleNames)) {
    throw new NativePostgresTestError("roleNames must be an array");
  }
  const normalizedPrefix = requireString(databasePrefix, "databasePrefix");
  if (!DATABASE_PREFIX_PATTERN.test(normalizedPrefix)) {
    throw new NativePostgresTestError(
      "databasePrefix must be 3-24 lowercase letters, digits, or underscores",
    );
  }
  const prefix = `${normalizedPrefix}_`;
  const bootstrap = new Set(createdBootstrapRoles);
  for (const role of bootstrap) {
    if (!BOOTSTRAP_ROLES.has(role)) {
      throw new NativePostgresTestError("Refusing unrecognized owned bootstrap role");
    }
  }

  return Array.from(new Set(roleNames))
    .filter(
      (role) =>
        typeof role === "string" &&
        SAFE_IDENTIFIER_PATTERN.test(role) &&
        (bootstrap.has(role) || role.startsWith(prefix)),
    )
    .sort();
}

export function acquireNativePostgresPrefixLock({ host, port, databasePrefix }) {
  const requestedHost = requireString(host, "host");
  const normalizedPrefix = requireString(databasePrefix, "databasePrefix");
  const normalizedPort = Number(port);
  if (!path.isAbsolute(requestedHost)) {
    throw new NativePostgresTestError("Native PostgreSQL prefix-lock host must be absolute");
  }
  if (!DATABASE_PREFIX_PATTERN.test(normalizedPrefix)) {
    throw new NativePostgresTestError(
      "databasePrefix must be 3-24 lowercase letters, digits, or underscores",
    );
  }
  if (!Number.isInteger(normalizedPort) || normalizedPort < 1_024 || normalizedPort > 65_535) {
    throw new NativePostgresTestError("Native PostgreSQL prefix-lock port is invalid");
  }
  const realHost = fs.realpathSync(requestedHost);
  const lockPath = path.join(
    realHost,
    `.dealflow-native-${normalizedPort}-${normalizedPrefix}.lock`,
  );
  try {
    fs.mkdirSync(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new NativePostgresTestError(
        "Native PostgreSQL database prefix is already owned; refusing concurrent or stale-lock execution",
      );
    }
    throw new NativePostgresTestError("Unable to acquire native PostgreSQL prefix ownership lock", {
      cause: error,
    });
  }
  const stat = fs.lstatSync(lockPath, { bigint: true });
  if (!stat.isDirectory()) {
    throw new NativePostgresTestError("Native PostgreSQL prefix ownership lock is not a directory");
  }
  return Object.freeze({
    path: lockPath,
    device: stat.dev,
    inode: stat.ino,
  });
}

export function releaseNativePostgresPrefixLock(lock) {
  if (!lock || typeof lock.path !== "string" || !path.isAbsolute(lock.path)) {
    throw new NativePostgresTestError("Native PostgreSQL prefix ownership lock token is invalid");
  }
  const stat = fs.lstatSync(lock.path, { bigint: true });
  if (!stat.isDirectory() || stat.dev !== lock.device || stat.ino !== lock.inode) {
    throw new NativePostgresTestError(
      "Native PostgreSQL prefix ownership lock identity changed; refusing release",
    );
  }
  fs.rmdirSync(lock.path);
  return true;
}

function makeFailure(label, result) {
  const diagnostic = sanitizePostgresDiagnostic(
    [
      result.error?.message,
      result.stderr,
      result.stdout,
      `process exited with status ${result.status}`,
    ].filter(Boolean).join(" | "),
  );
  return new NativePostgresTestError(`${label}: ${diagnostic || "unknown PostgreSQL failure"}`);
}

export function createNativePostgresTestAdapter(options) {
  return new NativePostgresTestAdapter(options);
}

class NativePostgresTestAdapter {
  #databasePrefix;
  #expectedVersion;
  #expectedVersionNumber;
  #host;
  #maxOutputBytes;
  #ownedDatabases = new Set();
  #pgbin;
  #port;
  #prefixLock = null;
  #sequence = 0;
  #timeoutMs;
  #user;

  constructor({
    pgbin,
    host,
    port,
    user,
    expectedVersion = "17.6",
    databasePrefix = "df_native_test",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  } = {}) {
    const requestedPgbin = requireString(pgbin, "pgbin");
    const requestedHost = requireString(host, "host");
    const requestedUser = requireString(user, "user");

    if (!path.isAbsolute(requestedPgbin)) {
      throw new NativePostgresTestError("pgbin must be an absolute local directory");
    }
    if (!path.isAbsolute(requestedHost)) {
      throw new NativePostgresTestError(
        "host must be an absolute Unix-socket directory; TCP hosts are refused",
      );
    }
    if (!fs.existsSync(requestedPgbin) || !fs.statSync(requestedPgbin).isDirectory()) {
      throw new NativePostgresTestError("pgbin does not name an existing directory");
    }
    if (!fs.existsSync(requestedHost) || !fs.statSync(requestedHost).isDirectory()) {
      throw new NativePostgresTestError("host does not name an existing Unix-socket directory");
    }

    this.#pgbin = fs.realpathSync(requestedPgbin);
    this.#host = fs.realpathSync(requestedHost);
    this.#port = Number(port);
    this.#user = requestedUser;
    this.#expectedVersion = requireString(expectedVersion, "expectedVersion");
    this.#expectedVersionNumber = expectedServerVersionNumber(this.#expectedVersion);
    this.#databasePrefix = requireString(databasePrefix, "databasePrefix");
    this.#timeoutMs = Number(timeoutMs);
    this.#maxOutputBytes = Number(maxOutputBytes);

    if (!Number.isInteger(this.#port) || this.#port < 1_024 || this.#port > 65_535) {
      throw new NativePostgresTestError("port must be an integer from 1024 through 65535");
    }
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(this.#user)) {
      throw new NativePostgresTestError("user contains unsupported characters");
    }
    if (!DATABASE_PREFIX_PATTERN.test(this.#databasePrefix)) {
      throw new NativePostgresTestError(
        "databasePrefix must be 3-24 lowercase letters, digits, or underscores",
      );
    }
    if (!Number.isInteger(this.#timeoutMs) || this.#timeoutMs < 1_000) {
      throw new NativePostgresTestError("timeoutMs must be an integer of at least 1000");
    }
    if (!Number.isInteger(this.#maxOutputBytes) || this.#maxOutputBytes < 4_096) {
      throw new NativePostgresTestError("maxOutputBytes must be an integer of at least 4096");
    }

    const hostStat = fs.statSync(this.#host);
    if (typeof process.getuid === "function" && hostStat.uid !== process.getuid()) {
      throw new NativePostgresTestError("Unix-socket directory is not owned by this user");
    }
    if ((hostStat.mode & 0o077) !== 0) {
      throw new NativePostgresTestError("Unix-socket directory must deny group and other access");
    }

    for (const binary of REQUIRED_BINARIES) {
      const binaryPath = path.join(this.#pgbin, binary);
      try {
        fs.accessSync(binaryPath, fs.constants.X_OK);
      } catch {
        throw new NativePostgresTestError(`Required PostgreSQL binary is unavailable: ${binary}`);
      }
    }
  }

  get databasePrefix() {
    return this.#databasePrefix;
  }

  preflight() {
    const socketPath = path.join(this.#host, `.s.PGSQL.${this.#port}`);
    let socketStat;
    try {
      socketStat = fs.lstatSync(socketPath);
    } catch {
      throw new NativePostgresTestError("Expected PostgreSQL Unix socket is unavailable");
    }
    if (!socketStat.isSocket()) {
      throw new NativePostgresTestError("Configured PostgreSQL endpoint is not a Unix socket");
    }

    const binaryVersion = this.#runSync("postgres", ["--version"], {
      database: MAINTENANCE_DATABASE,
      label: "Read PostgreSQL binary version",
    }).stdout.trim();
    const escapedVersion = this.#expectedVersion.replaceAll(".", "\\.");
    if (!new RegExp(`\\b${escapedVersion}(?:\\s|\\(|$)`).test(binaryVersion)) {
      throw new NativePostgresTestError(
        `PostgreSQL binary is not the required ${this.#expectedVersion} release`,
      );
    }

    const output = this.psql(
      `select
         current_setting('server_version_num'),
         current_setting('server_version'),
         current_setting('listen_addresses'),
         current_setting('unix_socket_directories'),
         current_setting('unix_socket_permissions'),
         current_user,
         current_database(),
         coalesce(inet_client_addr()::text, ''),
         coalesce(inet_server_addr()::text, '');`,
      { database: MAINTENANCE_DATABASE, label: "Verify isolated PostgreSQL server" },
    );
    const fields = output.split("|");
    if (fields.length !== 9) {
      throw new NativePostgresTestError("PostgreSQL preflight returned an unexpected shape");
    }

    const [
      versionNumber,
      serverVersion,
      listenAddresses,
      socketDirectories,
      socketPermissions,
      currentUser,
      currentDatabase,
      clientAddress,
      serverAddress,
    ] = fields;

    if (versionNumber !== this.#expectedVersionNumber) {
      throw new NativePostgresTestError(
        `PostgreSQL server_version_num is ${versionNumber}, expected ${this.#expectedVersionNumber}`,
      );
    }
    if (listenAddresses !== "") {
      throw new NativePostgresTestError("PostgreSQL TCP listening is enabled; refusing test run");
    }
    const configuredSockets = socketDirectories
      .split(",")
      .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ""));
    if (!configuredSockets.includes(this.#host)) {
      throw new NativePostgresTestError("PostgreSQL is not bound to the requested Unix socket");
    }
    if (socketPermissions !== "0700") {
      throw new NativePostgresTestError(
        `PostgreSQL Unix-socket permissions are ${socketPermissions}, expected 0700`,
      );
    }
    if (currentUser !== this.#user || currentDatabase !== MAINTENANCE_DATABASE) {
      throw new NativePostgresTestError("PostgreSQL connected with an unexpected user or database");
    }
    if (clientAddress !== "" || serverAddress !== "") {
      throw new NativePostgresTestError("PostgreSQL connection used TCP instead of a Unix socket");
    }

    return Object.freeze({
      binaryVersion,
      serverVersion,
      versionNumber,
      listenAddresses,
      socketDirectory: this.#host,
      socketPermissions,
      user: currentUser,
    });
  }

  psql(sql, { database = MAINTENANCE_DATABASE, label = "Run PostgreSQL statement", timeoutMs } = {}) {
    this.#assertDatabaseTarget(database);
    const result = this.#runSync("psql", this.#psqlArgs(database), {
      database,
      input: requireString(sql, "sql"),
      label,
      timeoutMs,
    });
    return result.stdout.trim();
  }

  psqlMustFail(
    sql,
    pattern,
    { database = MAINTENANCE_DATABASE, label = "Run rejected PostgreSQL statement", timeoutMs } = {},
  ) {
    if (!(pattern instanceof RegExp)) {
      throw new NativePostgresTestError("psqlMustFail requires a diagnostic RegExp");
    }
    this.#assertDatabaseTarget(database);
    const result = this.#runSync("psql", this.#psqlArgs(database), {
      allowFailure: true,
      database,
      input: requireString(sql, "sql"),
      label,
      timeoutMs,
    });
    if (result.status === 0) {
      throw new NativePostgresTestError(`${label}: SQL unexpectedly succeeded`);
    }
    const diagnostic = sanitizePostgresDiagnostic(result.stderr || result.stdout);
    const safePattern = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
    if (!safePattern.test(diagnostic)) {
      throw new NativePostgresTestError(`${label}: unexpected rejection: ${diagnostic}`);
    }
    return diagnostic;
  }

  async psqlConcurrent(
    statements,
    { database = MAINTENANCE_DATABASE, label = "Run concurrent PostgreSQL statements", timeoutMs } = {},
  ) {
    if (!Array.isArray(statements) || statements.length === 0) {
      throw new NativePostgresTestError("psqlConcurrent requires at least one SQL statement");
    }
    this.#assertDatabaseTarget(database);
    const settled = await Promise.allSettled(
      statements.map((sql, index) =>
        this.#runAsync("psql", this.#psqlArgs(database), {
          database,
          input: requireString(sql, `statements[${index}]`),
          label: `${label} #${index + 1}`,
          timeoutMs,
        }),
      ),
    );
    const failures = settled
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);
    if (failures.length > 0) {
      const details = failures
        .map((failure) => sanitizePostgresDiagnostic(failure))
        .filter(Boolean)
        .join(" | ");
      throw new AggregateError(
        failures,
        `${label}: ${failures.length} client(s) failed${details ? `: ${details}` : ""}`,
      );
    }
    return settled.map((result) => result.value.stdout.trim());
  }

  databaseExists(database) {
    this.#assertSafeDisposableName(database);
    return this.psql(
      `select exists(select 1 from pg_database where datname = '${database}');`,
      { database: MAINTENANCE_DATABASE, label: "Check disposable database cleanup" },
    ) === "t";
  }

  listDisposableDatabases() {
    const prefix = `${this.#databasePrefix}_`;
    const output = this.psql(
      `select datname
         from pg_database
        where left(datname, ${prefix.length}) = '${prefix}'
        order by datname;`,
      { database: MAINTENANCE_DATABASE, label: "List disposable test databases" },
    );
    return output === "" ? [] : output.split(/\r?\n/).filter(Boolean);
  }

  startDisposableDatabase() {
    this.preflight();
    if (this.#prefixLock) {
      throw new NativePostgresTestError(
        "Native PostgreSQL adapter already owns an active database prefix",
      );
    }
    this.#prefixLock = acquireNativePostgresPrefixLock({
      host: this.#host,
      port: this.#port,
      databasePrefix: this.#databasePrefix,
    });
    const createdBootstrapRoles = new Set();
    let database;
    try {
      database = this.#createDatabase();
    } catch (error) {
      if (this.#ownedDatabases.size === 0) {
        releaseNativePostgresPrefixLock(this.#prefixLock);
        this.#prefixLock = null;
      }
      throw error;
    }
    let cleaned = false;
    const cleanupOwnedState = ({ bestEffort = false } = {}) => {
      const databaseDropped = this.#dropDatabase(database, { bestEffort });
      if (!databaseDropped) return false;
      const rolesDropped = this.#dropOwnedRoles(createdBootstrapRoles, { bestEffort });
      if (!rolesDropped) return false;
      try {
        releaseNativePostgresPrefixLock(this.#prefixLock);
        this.#prefixLock = null;
        return true;
      } catch (error) {
        if (bestEffort) return false;
        throw error;
      }
    };
    const exitCleanup = () => {
      if (cleaned) return;
      cleaned = cleanupOwnedState({ bestEffort: true });
    };
    const interruptCleanup = () => {
      exitCleanup();
      process.exit(130);
    };
    const terminateCleanup = () => {
      exitCleanup();
      process.exit(143);
    };
    process.once("exit", exitCleanup);
    process.once("SIGINT", interruptCleanup);
    process.once("SIGTERM", terminateCleanup);

    try {
      this.#bootstrapDatabase(database, createdBootstrapRoles);
    } catch (error) {
      exitCleanup();
      process.removeListener("exit", exitCleanup);
      process.removeListener("SIGINT", interruptCleanup);
      process.removeListener("SIGTERM", terminateCleanup);
      throw error;
    }

    const cleanup = () => {
      if (cleaned) return true;
      const removed = cleanupOwnedState();
      if (removed) {
        cleaned = true;
        process.removeListener("exit", exitCleanup);
        process.removeListener("SIGINT", interruptCleanup);
        process.removeListener("SIGTERM", terminateCleanup);
      }
      return removed;
    };

    return Object.freeze({
      cleanup,
      database,
      host: this.#host,
      mode: "native",
      port: this.#port,
      user: this.#user,
      psql: (sql, options = {}) => this.psql(sql, { ...options, database }),
      psqlMustFail: (sql, pattern, options = {}) =>
        this.psqlMustFail(sql, pattern, { ...options, database }),
      psqlConcurrent: (statements, options = {}) =>
        this.psqlConcurrent(statements, { ...options, database }),
    });
  }

  async withDisposableDatabase(callback) {
    if (typeof callback !== "function") {
      throw new NativePostgresTestError("withDisposableDatabase requires a callback");
    }
    const session = this.startDisposableDatabase();
    let callbackResult;
    let primaryError;
    try {
      callbackResult = await callback(session);
    } catch (error) {
      primaryError = error;
    }

    let cleanupError;
    try {
      session.cleanup();
    } catch (error) {
      cleanupError = error;
    }

    if (primaryError && cleanupError) {
      throw new AggregateError(
        [primaryError, cleanupError],
        "Disposable PostgreSQL test and cleanup both failed",
      );
    }
    if (cleanupError) throw cleanupError;
    if (primaryError) throw primaryError;
    return callbackResult;
  }

  #assertDatabaseTarget(database) {
    if (database === MAINTENANCE_DATABASE) return;
    this.#assertSafeDisposableName(database);
    if (!this.#ownedDatabases.has(database)) {
      throw new NativePostgresTestError("Refusing PostgreSQL database not owned by this adapter");
    }
  }

  #assertSafeDisposableName(database) {
    if (
      typeof database !== "string" ||
      !database.startsWith(`${this.#databasePrefix}_`) ||
      !/^[a-z][a-z0-9_]{2,62}$/.test(database)
    ) {
      throw new NativePostgresTestError("Refusing unsafe disposable database name");
    }
  }

  #baseEnv(database) {
    return {
      PATH: `${this.#pgbin}:/usr/bin:/bin`,
      HOME: this.#host,
      LANG: "C",
      LC_ALL: "C",
      TERM: "dumb",
      PGDATABASE: database,
      PGHOST: this.#host,
      PGOPTIONS: "-c timezone=UTC",
      PGPASSFILE: path.join(this.#host, ".dealflow-native-adapter-no-pgpass"),
      PGPORT: String(this.#port),
      PGSSLMODE: "disable",
      PGUSER: this.#user,
      PSQLRC: "/dev/null",
    };
  }

  #ensureBootstrapRole(database, role, attributes, createdBootstrapRoles) {
    if (!BOOTSTRAP_ROLES.has(role)) {
      throw new NativePostgresTestError("Refusing unrecognized bootstrap role");
    }
    const result = this.#runSync("psql", this.#psqlArgs(database), {
      allowFailure: true,
      database,
      input: `create role ${quoteIdentifier(role)} ${attributes};`,
      label: `Create isolated PostgreSQL bootstrap role ${role}`,
    });
    if (result.status === 0) {
      createdBootstrapRoles.add(role);
      return;
    }
    const diagnostic = sanitizePostgresDiagnostic(result.stderr || result.stdout);
    if (new RegExp(`role "${role}" already exists`, "i").test(diagnostic)) {
      return;
    }
    throw makeFailure(`Create isolated PostgreSQL bootstrap role ${role}`, result);
  }

  #bootstrapDatabase(database, createdBootstrapRoles) {
    this.#ensureBootstrapRole(database, "anon", "nologin", createdBootstrapRoles);
    this.#ensureBootstrapRole(database, "authenticated", "nologin", createdBootstrapRoles);
    this.#ensureBootstrapRole(
      database,
      "service_role",
      "nologin bypassrls",
      createdBootstrapRoles,
    );
    this.psql(
      `alter role anon nologin;
       alter role authenticated nologin;
       alter role service_role nologin bypassrls;
       alter role anon set search_path to public, extensions;
       alter role authenticated set search_path to public, extensions;
       alter role service_role set search_path to public, extensions;

       create schema if not exists auth authorization ${this.#user};
       create schema if not exists extensions authorization ${this.#user};
       create extension if not exists pgcrypto with schema extensions;
       create table if not exists auth.users (
         id uuid primary key
       );

       create or replace function auth.uid()
       returns uuid
       language sql
       stable
       as $$
         select coalesce(
           nullif(current_setting('request.jwt.claim.sub', true), ''),
           (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
         )::uuid
       $$;

       create or replace function auth.role()
       returns text
       language sql
       stable
       as $$
         select coalesce(
           nullif(current_setting('request.jwt.claim.role', true), ''),
           (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
         )::text
       $$;

       create or replace function auth.email()
       returns text
       language sql
       stable
       as $$
         select coalesce(
           nullif(current_setting('request.jwt.claim.email', true), ''),
           (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
         )::text
       $$;

       create or replace function auth.jwt()
       returns jsonb
       language sql
       stable
       as $$
         select coalesce(
           nullif(current_setting('request.jwt.claim', true), ''),
           nullif(current_setting('request.jwt.claims', true), '')
         )::jsonb
       $$;

       revoke all on schema auth from public;
       grant usage on schema auth, extensions, public to anon, authenticated, service_role;
       revoke all on function auth.uid(), auth.role(), auth.email(), auth.jwt() from public;
       grant execute on function auth.uid(), auth.role(), auth.email(), auth.jwt()
         to anon, authenticated, service_role;

       -- Supabase projects grant API roles privileges on newly created public
       -- objects through owner default privileges. Mirror that local contract
       -- before each disposable test creates its fixture tables; individual
       -- migrations remain responsible for any explicit revocations.
       alter default privileges in schema public
         grant all privileges on tables to anon, authenticated, service_role;
       alter default privileges in schema public
         grant all privileges on sequences to anon, authenticated, service_role;
       alter default privileges in schema public
         grant all privileges on functions to anon, authenticated, service_role;
       alter default privileges in schema public
         grant usage on types to anon, authenticated, service_role;`,
      { database, label: "Bootstrap isolated Supabase-compatible database" },
    );
  }

  #createDatabase() {
    this.#sequence += 1;
    const database = [
      this.#databasePrefix,
      process.pid,
      Date.now(),
      this.#sequence,
      randomBytes(5).toString("hex"),
    ].join("_");
    this.#assertSafeDisposableName(database);
    this.#ownedDatabases.add(database);
    try {
      this.#runSync(
        "createdb",
        [
          "--host",
          this.#host,
          "--port",
          String(this.#port),
          "--username",
          this.#user,
          "--no-password",
          "--maintenance-db",
          MAINTENANCE_DATABASE,
          "--owner",
          this.#user,
          "--encoding",
          "UTF8",
          "--template",
          "template0",
          database,
        ],
        {
          database: MAINTENANCE_DATABASE,
          label: "Create disposable PostgreSQL database",
        },
      );
      return database;
    } catch (error) {
      let cleanupError;
      try {
        this.#dropDatabase(database);
      } catch (candidateCleanupError) {
        cleanupError = candidateCleanupError;
      }
      if (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Disposable PostgreSQL database creation outcome was uncertain and cleanup could not prove absence",
        );
      }
      throw error;
    }
  }

  #listRoles() {
    const output = this.psql(
      "select rolname from pg_roles order by rolname;",
      { database: MAINTENANCE_DATABASE, label: "List PostgreSQL roles for cleanup fencing" },
    );
    return output === "" ? [] : output.split(/\r?\n/).filter(Boolean);
  }

  #dropOwnedRoles(createdBootstrapRoles, { bestEffort = false } = {}) {
    const ownedRoles = selectNativePostgresOwnedRolesForCleanup({
      roleNames: this.#listRoles(),
      databasePrefix: this.#databasePrefix,
      createdBootstrapRoles,
    });
    const rolePrefix = `${this.#databasePrefix}_`;
    const dropOrder = [
      ...ownedRoles.filter((role) => role.startsWith(rolePrefix)).reverse(),
      ...ownedRoles.filter((role) => !role.startsWith(rolePrefix)).reverse(),
    ];
    const failures = [];
    for (const role of dropOrder) {
      try {
        this.psql(`drop role if exists ${quoteIdentifier(role)};`, {
          database: MAINTENANCE_DATABASE,
          label: "Drop adapter-owned disposable PostgreSQL role",
        });
      } catch (error) {
        failures.push(error);
      }
    }
    const remaining = selectNativePostgresOwnedRolesForCleanup({
      roleNames: this.#listRoles(),
      databasePrefix: this.#databasePrefix,
      createdBootstrapRoles,
    });
    if (failures.length > 0 || remaining.length > 0) {
      if (bestEffort) return false;
      throw new AggregateError(
        failures,
        `Adapter-owned PostgreSQL role cleanup failed; ${remaining.length} role(s) remain`,
      );
    }
    return true;
  }

  #dropDatabase(database, { bestEffort = false } = {}) {
    if (!this.#ownedDatabases.has(database)) return true;
    this.#assertSafeDisposableName(database);
    try {
      this.#runSync(
        "dropdb",
        [
          "--host",
          this.#host,
          "--port",
          String(this.#port),
          "--username",
          this.#user,
          "--no-password",
          "--maintenance-db",
          MAINTENANCE_DATABASE,
          "--if-exists",
          "--force",
          database,
        ],
        {
          database: MAINTENANCE_DATABASE,
          label: "Drop disposable PostgreSQL database",
        },
      );
    } catch (dropdbError) {
      try {
        this.psql(`drop database if exists ${quoteIdentifier(database)} with (force);`, {
          database: MAINTENANCE_DATABASE,
          label: "Force cleanup of disposable PostgreSQL database",
        });
      } catch (fallbackError) {
        if (bestEffort) return false;
        throw new AggregateError(
          [dropdbError, fallbackError],
          "Disposable PostgreSQL database cleanup failed",
        );
      }
    }

    if (this.databaseExists(database)) {
      if (bestEffort) return false;
      throw new NativePostgresTestError("Disposable PostgreSQL database remained after cleanup");
    }
    this.#ownedDatabases.delete(database);
    return true;
  }

  #psqlArgs(database) {
    return [
      "--host",
      this.#host,
      "--port",
      String(this.#port),
      "--username",
      this.#user,
      "--dbname",
      database,
      "--no-password",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--set=VERBOSITY=terse",
      "--set=SHOW_CONTEXT=never",
      "--tuples-only",
      "--no-align",
      "--field-separator=|",
      "--quiet",
    ];
  }

  #runSync(
    binary,
    args,
    {
      allowFailure = false,
      database,
      input,
      label,
      timeoutMs = this.#timeoutMs,
    },
  ) {
    const result = spawnSync(path.join(this.#pgbin, binary), args, {
      encoding: "utf8",
      env: this.#baseEnv(database),
      input,
      maxBuffer: this.#maxOutputBytes,
      timeout: timeoutMs,
    });
    if (result.error || (!allowFailure && result.status !== 0)) {
      throw makeFailure(label, result);
    }
    return {
      status: result.status ?? -1,
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
    };
  }

  #runAsync(binary, args, { database, input, label, timeoutMs = this.#timeoutMs }) {
    return new Promise((resolve, reject) => {
      const child = spawn(path.join(this.#pgbin, binary), args, {
        env: this.#baseEnv(database),
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let outputBytes = 0;
      let timedOut = false;
      let overflowed = false;
      let settled = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      const append = (target, chunk) => {
        outputBytes += Buffer.byteLength(chunk);
        if (outputBytes > this.#maxOutputBytes) {
          overflowed = true;
          child.kill("SIGKILL");
          return target;
        }
        return target + chunk;
      };

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout = append(stdout, chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr = append(stderr, chunk);
      });
      child.stdin.on("error", () => {});
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new NativePostgresTestError(`${label}: ${sanitizePostgresDiagnostic(error)}`));
      });
      child.once("close", (status) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (timedOut) {
          reject(new NativePostgresTestError(`${label}: timed out after ${timeoutMs}ms`));
          return;
        }
        if (overflowed) {
          reject(new NativePostgresTestError(`${label}: output exceeded the safe limit`));
          return;
        }
        const result = { status: status ?? -1, stdout, stderr };
        if (status !== 0) {
          reject(makeFailure(label, result));
          return;
        }
        resolve(result);
      });
      child.stdin.end(input);
    });
  }
}
