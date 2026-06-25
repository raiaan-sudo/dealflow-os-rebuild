#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";

const forwardedArgs = process.argv.slice(2);

nextEnv.loadEnvConfig(process.cwd());

const rawEnv = { ...process.env };
const removedCodexCi = Object.prototype.hasOwnProperty.call(rawEnv, "CODEX_CI");

delete rawEnv.CODEX_CI;

const passThroughNames = new Set([
  "PATH",
  "HOME",
  "SHELL",
  "USER",
  "LOGNAME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "CI",
  "NEXT_TELEMETRY_DISABLED",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "APP_URL",
  "VERCEL_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "QA_AUTH_PROOF_SECRET",
  "INTERNAL_SYSTEM_JOBS_SECRET",
  "CRON_SECRET",
  "QA_AUTH_HARNESS_ENABLED",
  "QA_AUTH_HARNESS_PRODUCTION_ENABLED",
  "QA_EMAIL",
  "SAFE_E2E_BASE_URL",
  "SAFE_E2E_BROWSER_CHANNEL",
  "SAFE_E2E_QA_AUTH",
  "SAFE_E2E_RUN_TIMEOUT_MS",
  "SAFE_E2E_SERVER_COMMAND",
  "SCHEMA_VALIDATION_MODE",
  "ALLOW_OPENAI_IMAGE_GENERATION",
  "ALLOW_HEYGEN_VIDEO_GENERATION",
  "ALLOW_META_LIVE_LAUNCH",
]);

const passThroughPrefixes = ["PLAYWRIGHT_", "PW_"];

function buildE2eEnv() {
  if (rawEnv.SAFE_E2E_INHERIT_ENV === "true") {
    return { ...rawEnv };
  }

  const cleanEnv = {};
  for (const [name, value] of Object.entries(rawEnv)) {
    if (passThroughNames.has(name) || passThroughPrefixes.some((prefix) => name.startsWith(prefix))) {
      cleanEnv[name] = value;
    }
  }

  return cleanEnv;
}

const env = buildE2eEnv();

const baseUrl = env.SAFE_E2E_BASE_URL?.trim() || "http://127.0.0.1:3100";
const isListOnly = forwardedArgs.includes("--list");

function hasSupabaseAuthEnv() {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() &&
      env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      env.QA_EMAIL?.trim(),
  );
}

if (!isListOnly && env.SAFE_E2E_ALLOW_PUBLIC_ONLY !== "true") {
  if (env.SAFE_E2E_QA_AUTH !== "true" && hasSupabaseAuthEnv()) {
    env.SAFE_E2E_QA_AUTH = "true";
  }

  if (env.SAFE_E2E_QA_AUTH !== "true") {
    console.error(
      JSON.stringify({
        event: "safe_e2e.auth_required",
        message:
          "Safe E2E requires an authenticated journey. Load NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, and QA_EMAIL, or set SAFE_E2E_ALLOW_PUBLIC_ONLY=true for a public-only diagnostic run.",
      }),
    );
    process.exit(1);
  }
}

if (env.SAFE_E2E_QA_AUTH === "true") {
  env.QA_AUTH_HARNESS_ENABLED = env.QA_AUTH_HARNESS_ENABLED?.trim() || "true";
  env.QA_AUTH_HARNESS_PRODUCTION_ENABLED = env.QA_AUTH_HARNESS_PRODUCTION_ENABLED?.trim() || "true";
  env.QA_AUTH_PROOF_SECRET =
    env.QA_AUTH_PROOF_SECRET?.trim() ||
    env.INTERNAL_SYSTEM_JOBS_SECRET?.trim() ||
    env.CRON_SECRET?.trim() ||
    `safe-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

env.TRUSTED_APP_ORIGINS = [env.TRUSTED_APP_ORIGINS, baseUrl]
  .filter((value) => typeof value === "string" && value.trim().length > 0)
  .join(",");
const authMode = env.SAFE_E2E_QA_AUTH === "true" ? "authenticated" : "public";
const qaHarness = env.QA_AUTH_HARNESS_ENABLED === "true" ? "enabled" : "disabled";
const browserChannel = env.SAFE_E2E_BROWSER_CHANNEL?.trim() || "bundled-chromium";
const runTimeoutMs = Number.parseInt(env.SAFE_E2E_RUN_TIMEOUT_MS ?? "", 10) || 300_000;
const playwrightBin = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "playwright.cmd" : "playwright",
);
console.log(
  JSON.stringify({
    event: "safe_e2e.start",
    baseUrl,
    authMode,
    qaHarness,
    browserChannel,
    codexCiRemoved: removedCodexCi,
    isolatedEnv: rawEnv.SAFE_E2E_INHERIT_ENV !== "true",
    runTimeoutMs,
  }),
);

if (isListOnly && removedCodexCi) {
  const testFile = path.join(process.cwd(), "tests", "e2e", "safe-self-serve.spec.ts");
  const source = fs.readFileSync(testFile, "utf8");
  const testNames = [...source.matchAll(/\btest\(\s*["']([^"']+)["']/g)].map((match) => match[1]);
  for (const testName of testNames) {
    console.log(`  [chromium] › safe-self-serve.spec.ts: ${testName}`);
  }
  console.log(`Total: ${testNames.length} test${testNames.length === 1 ? "" : "s"} in 1 file`);
  process.exit(0);
}

const child = spawn(
  playwrightBin,
  ["test", "--config=playwright.safe.config.ts", ...forwardedArgs],
  {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    detached: process.platform !== "win32",
  },
);

const timeout = setTimeout(() => {
  console.error(
    JSON.stringify({
      event: "safe_e2e.timeout",
      message: "Safe E2E exceeded its watchdog timeout before completing.",
      timeoutMs: runTimeoutMs,
      authMode,
      qaHarness,
    }),
  );

  if (child.pid) {
    try {
      if (process.platform === "win32") {
        child.kill("SIGTERM");
      } else {
        process.kill(-child.pid, "SIGTERM");
      }
    } catch {
      child.kill("SIGTERM");
    }
  }
}, runTimeoutMs);

child.on("error", (error) => {
  clearTimeout(timeout);
  console.error(
    JSON.stringify({
      event: "safe_e2e.spawn_failed",
      message: error.message,
    }),
  );
  process.exit(1);
});

child.on("exit", (code, signal) => {
  clearTimeout(timeout);
  if (signal) {
    console.error(
      JSON.stringify({
        event: "safe_e2e.signal",
        signal,
      }),
    );
    process.exit(1);
  }

  process.exit(code ?? 1);
});
