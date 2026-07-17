import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  createNativePostgresTestAdapter,
  sanitizePostgresDiagnostic,
} from "./native-postgres-test-adapter.mjs";

const DEFAULT_MAX_BUFFER = 8 * 1024 * 1024;

function success(stdout = "") {
  return { error: undefined, signal: null, status: 0, stderr: "", stdout };
}

function failure(error) {
  return {
    error: undefined,
    signal: null,
    status: 1,
    stderr: `${sanitizePostgresDiagnostic(error)}\n`,
    stdout: "",
  };
}

export function assertDisposablePostgresCleanupResult(result) {
  if (result?.error || result?.status !== 0) {
    const diagnostic = sanitizePostgresDiagnostic(
      result?.error?.message || result?.stderr || result?.stdout || `exit ${result?.status}`,
    );
    throw new Error(`Disposable PostgreSQL cleanup failed: ${diagnostic || "unknown failure"}`);
  }
  return result;
}

function requireNativeConfig() {
  const values = {
    pgbin: process.env.DEALFLOW_NATIVE_PGBIN,
    host: process.env.DEALFLOW_NATIVE_PGHOST,
    port: process.env.DEALFLOW_NATIVE_PGPORT,
    user: process.env.DEALFLOW_NATIVE_PGUSER,
  };
  for (const [name, value] of Object.entries(values)) {
    if (!value) {
      throw new Error(`Native PostgreSQL mode requires DEALFLOW_NATIVE_${name.toUpperCase()}`);
    }
  }
  return values;
}

function parsePsqlUsername(args, fallback) {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value.startsWith("--username=")) return value.slice("--username=".length);
    if ((value === "--username" || value === "-U") && args[index + 1]) return args[index + 1];
  }
  return fallback;
}

export function nativeCompatiblePostgresUsername(username, nativeSuperuser) {
  if (username === "postgres") return nativeSuperuser;
  return username;
}

function roleSql(username, superuser, sql) {
  if (username === superuser) return sql;
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(username)) {
    throw new Error("Native PostgreSQL role name contains unsupported characters");
  }
  return `set role "${username}";\n${sql}`;
}

function parseExec(args, expectedContainer) {
  let index = 1;
  while (index < args.length && args[index].startsWith("-")) {
    const option = args[index];
    if (["-i", "-t", "-it", "-ti"].includes(option)) {
      index += 1;
      continue;
    }
    if (["--env", "-e", "--user", "-u", "--workdir", "-w"].includes(option)) {
      index += 2;
      continue;
    }
    if (option.startsWith("--env=") || option.startsWith("--user=")) {
      index += 1;
      continue;
    }
    break;
  }
  const container = args[index];
  const command = args[index + 1];
  if (container !== expectedContainer || !command) {
    throw new Error("Native PostgreSQL received an invalid container exec target");
  }
  return { command, commandArgs: args.slice(index + 2) };
}

export function createDisposablePostgresHarness({
  containerName,
  image,
  maxBuffer = DEFAULT_MAX_BUFFER,
}) {
  return new DisposablePostgresHarness({ containerName, image, maxBuffer });
}

class DisposablePostgresHarness {
  #adapter;
  #containerName;
  #image;
  #maxBuffer;
  #mode;
  #nativeUser;
  #session;

  constructor({ containerName, image, maxBuffer }) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(containerName)) {
      throw new Error("Disposable PostgreSQL container name is invalid");
    }
    this.#containerName = containerName;
    this.#image = image;
    this.#maxBuffer = Number(maxBuffer);
    if (!Number.isInteger(this.#maxBuffer) || this.#maxBuffer < 4_096) {
      throw new Error("Disposable PostgreSQL maxBuffer must be an integer of at least 4096");
    }
    this.#mode = process.env.DEALFLOW_DISPOSABLE_DB_MODE || "docker";
    if (!new Set(["docker", "native"]).has(this.#mode)) {
      throw new Error("DEALFLOW_DISPOSABLE_DB_MODE must be docker or native");
    }
    if (this.#mode === "native") {
      const config = requireNativeConfig();
      this.#nativeUser = config.user;
      const digest = createHash("sha256").update(containerName).digest("hex").slice(0, 10);
      this.#adapter = createNativePostgresTestAdapter({
        ...config,
        databasePrefix: `dfh_${digest}`,
        expectedVersion: "17.6",
        maxOutputBytes: this.#maxBuffer,
        timeoutMs: 60_000,
      });
    }
  }

  get mode() {
    return this.#mode;
  }

  run(args, options = {}) {
    if (this.#mode === "docker") {
      const result = spawnSync("docker", args, {
        encoding: "utf8",
        input: options.input,
        maxBuffer: options.maxBuffer ?? this.#maxBuffer,
        stdio: options.stdio,
        timeout: options.timeout ?? 60_000,
      });
      return args[0] === "rm" ? assertDisposablePostgresCleanupResult(result) : result;
    }
    try {
      const result = this.#runNative(args, options);
      return args[0] === "rm" ? assertDisposablePostgresCleanupResult(result) : result;
    } catch (error) {
      const result = failure(error);
      return args[0] === "rm" ? assertDisposablePostgresCleanupResult(result) : result;
    }
  }

  psqlAsync(psqlArgs, sql) {
    if (this.#mode === "docker") {
      return new Promise((resolve, reject) => {
        const child = spawn("docker", psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
        child.once("error", reject);
        child.once("close", (status) => resolve({ status, stdout, stderr }));
        child.stdin.end(sql);
      });
    }
    return this.#nativePsqlAsync(psqlArgs, sql);
  }

  #requireSession() {
    if (!this.#session) throw new Error("Native disposable PostgreSQL is not running");
    return this.#session;
  }

  #runNative(args, options) {
    if (args[0] === "image" && args[1] === "inspect") {
      if (args[2] !== this.#image) throw new Error("Unexpected PostgreSQL image preflight");
      this.#adapter.preflight();
      return success("[]\n");
    }
    if (args[0] === "run") {
      if (this.#session) throw new Error("Native disposable PostgreSQL is already running");
      if (!args.includes("--network=none")) {
        throw new Error("Disposable PostgreSQL run must explicitly disable networking");
      }
      if (args.includes("--publish") || args.includes("-p")) {
        throw new Error("Native disposable PostgreSQL refuses published ports");
      }
      const nameIndex = args.indexOf("--name");
      if (nameIndex < 0 || args[nameIndex + 1] !== this.#containerName) {
        throw new Error("Disposable PostgreSQL run has an unexpected container name");
      }
      if (args.at(-1) !== this.#image) {
        throw new Error("Disposable PostgreSQL run has an unexpected image");
      }
      this.#session = this.#adapter.startDisposableDatabase();
      return success(`native-${this.#containerName}\n`);
    }
    if (args[0] === "inspect") {
      this.#requireSession();
      return success("healthy\n");
    }
    if (args[0] === "exec") {
      return this.#runNativeExec(args, options);
    }
    if (args[0] === "rm") {
      if (this.#session) {
        this.#session.cleanup();
        this.#session = undefined;
      }
      return success(`${this.#containerName}\n`);
    }
    throw new Error(`Unsupported native PostgreSQL lifecycle command: ${args[0] || "missing"}`);
  }

  #runNativeExec(args, options) {
    const session = this.#requireSession();
    const { command, commandArgs } = parseExec(args, this.#containerName);
    if (command === "cat" && commandArgs[0] === "/proc/1/comm") {
      return success("postgres\n");
    }
    if (command === "pg_isready") {
      this.#adapter.preflight();
      return success(`${session.host}:${session.port} - accepting connections\n`);
    }
    if (command !== "psql") {
      throw new Error(`Unsupported native PostgreSQL exec command: ${command}`);
    }
    const sql = options.input ?? this.#commandSql(commandArgs);
    if (typeof sql !== "string" || sql.trim() === "") {
      throw new Error("Native PostgreSQL psql command did not provide SQL input");
    }
    const username = nativeCompatiblePostgresUsername(
      parsePsqlUsername(commandArgs, this.#nativeUser),
      this.#nativeUser,
    );
    const stdout = session.psql(roleSql(username, this.#nativeUser, sql), {
      label: "Run native disposable PostgreSQL statement",
      timeoutMs: options.timeout,
    });
    return success(stdout === "" ? "" : `${stdout}\n`);
  }

  #commandSql(args) {
    for (let index = 0; index < args.length; index += 1) {
      if (args[index].startsWith("--command=")) return args[index].slice("--command=".length);
      if ((args[index] === "--command" || args[index] === "-c") && args[index + 1]) {
        return args[index + 1];
      }
    }
    return undefined;
  }

  async #nativePsqlAsync(psqlArgs, sql) {
    try {
      const session = this.#requireSession();
      const { command, commandArgs } = parseExec(psqlArgs, this.#containerName);
      if (command !== "psql") throw new Error("Native concurrent command is not psql");
      const username = nativeCompatiblePostgresUsername(
        parsePsqlUsername(commandArgs, this.#nativeUser),
        this.#nativeUser,
      );
      const [stdout] = await session.psqlConcurrent(
        [roleSql(username, this.#nativeUser, sql)],
        { label: "Run concurrent native disposable PostgreSQL statement" },
      );
      return { status: 0, stdout: stdout === "" ? "" : `${stdout}\n`, stderr: "" };
    } catch (error) {
      return { status: 1, stdout: "", stderr: `${sanitizePostgresDiagnostic(error)}\n` };
    }
  }
}
