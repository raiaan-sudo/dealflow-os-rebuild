#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";

const forwardedArgs = process.argv.slice(2);
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
  "INTERNAL_SYSTEM_JOBS_SECRET",
  "CRON_SECRET",
  "QA_AUTH_HARNESS_ENABLED",
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
