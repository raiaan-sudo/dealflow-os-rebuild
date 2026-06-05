#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";

const ROOT = process.cwd();
const NOW = new Date();
const DATE = NOW.toISOString().slice(0, 10);
const STAMP = NOW.toISOString().replace(/[:.]/g, "-");
const REPORT_ROOT = path.join(ROOT, "performance-reports", DATE, `run-${STAMP}`);
const RAW_DIR = path.join(REPORT_ROOT, "raw");

const MODE = process.argv[2] ?? "smoke";
const BASE_URL = (process.env.PERFORMANCE_BASE_URL ?? process.env.LOAD_BASE_URL ?? process.env.BASE_URL ?? "").replace(/\/$/, "");
const ALLOW_PROD = process.env.PERFORMANCE_ALLOW_PROD === "true" || process.env.STRESS_TEST_ALLOW_PROD === "true";
const ALLOW_WRITES = process.env.PERFORMANCE_ALLOW_WRITES === "true" || process.env.STRESS_TEST_ALLOW_WRITES === "true";
const K6_BIN = process.env.K6_BIN ?? "k6";

const PRODUCTION_URL = /(^https:\/\/app\.agentdealflow\.io|^https:\/\/www\.agentdealflow\.io|^https:\/\/agentdealflow\.io|\.vercel\.app)/i;
const SAFE_PROD_MODES = new Set(["discover", "smoke", "rate-limit", "frontend"]);
const MATRIX_LEVELS = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(name, value) {
  const file = path.join(REPORT_ROOT, name);
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

function appendMarkdown(name, markdown) {
  const file = path.join(REPORT_ROOT, name);
  mkdirp(path.dirname(file));
  fs.appendFileSync(file, markdown);
  return file;
}

function isProductionLike(url) {
  return PRODUCTION_URL.test(url) && !/localhost|127\.0\.0\.1|preview|staging/i.test(url);
}

function assertSafeTarget() {
  if (!BASE_URL) {
    throw new Error("PERFORMANCE_BASE_URL or LOAD_BASE_URL is required.");
  }

  if (isProductionLike(BASE_URL) && !ALLOW_PROD && !SAFE_PROD_MODES.has(MODE)) {
    throw new Error(`Refusing production-like target ${BASE_URL} for mode ${MODE}. Use staging/preview, or set PERFORMANCE_ALLOW_PROD=true after explicit approval.`);
  }

  if (ALLOW_WRITES && isProductionLike(BASE_URL) && !ALLOW_PROD) {
    throw new Error("Refusing production writes. PERFORMANCE_ALLOW_WRITES requires PERFORMANCE_ALLOW_PROD=true and explicit approval.");
  }
}

function commandExists(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${JSON.stringify(command)}`], { encoding: "utf8" });
  return result.status === 0;
}

function runCommand(command, args, options = {}) {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });
  const durationMs = Math.round(performance.now() - started);
  const entry = {
    command: [command, ...args].join(" "),
    status: result.status === 0 ? "pass" : "fail",
    exitCode: result.status,
    durationMs,
    stdoutPath: null,
    stderrPath: null,
  };
  const slug = options.slug ?? command.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  entry.stdoutPath = path.join(RAW_DIR, `${slug}.stdout.log`);
  entry.stderrPath = path.join(RAW_DIR, `${slug}.stderr.log`);
  mkdirp(RAW_DIR);
  fs.writeFileSync(entry.stdoutPath, result.stdout ?? "");
  fs.writeFileSync(entry.stderrPath, result.stderr ?? "");
  return entry;
}

async function request(pathname, init = {}) {
  const started = performance.now();
  try {
    const response = await fetch(`${BASE_URL}${pathname}`, {
      redirect: "manual",
      ...init,
    });
    const body = await response.text();
    return {
      pathname,
      status: response.status,
      ok: response.status < 500,
      durationMs: Math.round(performance.now() - started),
      location: response.headers.get("location"),
      retryAfter: response.headers.get("retry-after"),
      bodySample: body.slice(0, 240),
    };
  } catch (error) {
    return {
      pathname,
      status: 0,
      ok: false,
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function percentile(values, pct) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1)];
}

async function runSafeHttpSmoke() {
  const probes = [
    request("/"),
    request("/login"),
    request("/privacy"),
    request("/terms"),
    request("/dashboard"),
    request("/admin/control-room"),
    request("/api/lead-capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
    request("/api/stripe/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invalid: true }),
    }),
    request("/api/webhooks/twilio/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ MessageSid: "SM_SAFE_INVALID", MessageStatus: "delivered" }),
    }),
  ];
  const results = await Promise.all(probes);
  const failures = results.filter((result) => {
    if (result.pathname === "/dashboard" || result.pathname === "/admin/control-room") return ![302, 307, 401].includes(result.status);
    if (result.pathname === "/api/lead-capture") return ![400, 422, 429].includes(result.status);
    if (result.pathname === "/api/stripe/webhook" || result.pathname === "/api/webhooks/twilio/status") return ![400, 401, 403, 429].includes(result.status);
    return ![200, 301, 302, 307].includes(result.status);
  });
  return {
    status: failures.length === 0 ? "pass" : "fail",
    baseUrl: BASE_URL,
    results,
    failures,
  };
}

async function runRateLimitProbe() {
  const total = Number.parseInt(process.env.PERFORMANCE_RATE_REQUESTS ?? "25", 10);
  const pathToProbe = process.env.PERFORMANCE_RATE_PATH ?? "/api/lead-capture";
  const requests = [];
  for (let index = 0; index < total; index += 1) {
    requests.push(request(pathToProbe, {
      method: "POST",
      headers: { "content-type": "application/json", "x-performance-audit": "true" },
      body: JSON.stringify({ audit: true, invalid: index }),
    }));
  }
  const results = await Promise.all(requests);
  const statuses = Object.fromEntries([...new Set(results.map((r) => r.status))].sort((a, b) => a - b).map((status) => [status, results.filter((r) => r.status === status).length]));
  const first429Index = results.findIndex((r) => r.status === 429);
  const has5xx = results.some((r) => r.status >= 500 || r.status === 0);
  return {
    status: has5xx ? "fail" : "pass",
    endpoint: pathToProbe,
    requestVolume: total,
    statuses,
    first429Request: first429Index >= 0 ? first429Index + 1 : null,
    retryAfter: results.find((r) => r.retryAfter)?.retryAfter ?? null,
    p95LatencyMs: Math.round(percentile(results.map((r) => r.durationMs), 95)),
    results,
  };
}

function runK6(script, extraEnv = {}) {
  if (!commandExists(K6_BIN)) {
    return {
      script,
      status: "blocked",
      reason: "k6 is not installed or not on PATH.",
      install: "brew install k6",
    };
  }
  return runCommand(K6_BIN, ["run", script], {
    slug: `k6-${path.basename(script, ".js")}`,
    env: {
      BASE_URL,
      STRESS_TEST_MODE: "true",
      STRESS_TEST_ALLOW_PROD: ALLOW_PROD ? "true" : "false",
      STRESS_TEST_COOKIE: process.env.PERFORMANCE_COOKIE ?? process.env.STRESS_TEST_COOKIE ?? "",
      ...extraEnv,
    },
  });
}

function k6MatrixScriptForMode(mode) {
  if (mode === "dashboard") return "tests/load/scripts/dashboard-load.js";
  if (mode === "onboarding") return "tests/load/scripts/onboarding-load.js";
  if (mode === "lead-capture") return "tests/load/scripts/lead-capture-load.js";
  if (mode === "spike") return "tests/load/scripts/spike-test.js";
  if (mode === "soak") return "tests/load/scripts/soak-test.js";
  if (mode === "breakpoint") return "tests/load/scripts/breakpoint-test.js";
  if (mode === "500-certification") return "tests/load/scripts/human-paced-500-certification.js";
  return "tests/load/scripts/public-pages-load.js";
}

async function main() {
  mkdirp(REPORT_ROOT);
  mkdirp(RAW_DIR);
  assertSafeTarget();

  const commands = [];
  const artifacts = {
    reportRoot: REPORT_ROOT,
    target: BASE_URL,
    mode: MODE,
    generatedAt: NOW.toISOString(),
    safety: {
      productionLike: isProductionLike(BASE_URL),
      allowProduction: ALLOW_PROD,
      allowWrites: ALLOW_WRITES,
      sideEffects: "No real Stripe, Meta, SMS/email, provider generation, funnel publish, or launch actions are performed by default.",
    },
    results: {},
    commands,
    blocked: [],
    verdict: "CONDITIONAL",
  };

  if (MODE === "discover" || MODE === "smoke" || MODE === "rate-limit" || MODE === "performance:all") {
    artifacts.results.safeHttpSmoke = await runSafeHttpSmoke();
    writeJson("raw/safe-http-smoke.json", artifacts.results.safeHttpSmoke);
  }

  if (MODE === "rate-limit" || MODE === "performance:all") {
    artifacts.results.rateLimit = await runRateLimitProbe();
    writeJson("raw/rate-limit.json", artifacts.results.rateLimit);
  }

  if (["100", "200", "300", "500", "1000"].includes(MODE)) {
    const vus = MODE;
    artifacts.results[`load${vus}`] = runK6(k6MatrixScriptForMode("public"), { VUS: vus, DURATION: process.env.PERFORMANCE_DURATION ?? "10m" });
  } else if (MODE === "spike" || MODE === "soak" || MODE === "breakpoint") {
    artifacts.results[MODE] = runK6(k6MatrixScriptForMode(MODE), { VUS: process.env.VUS ?? "100" });
  } else if (MODE === "500-certification") {
    artifacts.results[MODE] = runK6(k6MatrixScriptForMode(MODE), {
      VUS: process.env.VUS ?? "500",
      RAMP_UP: process.env.PERFORMANCE_RAMP_UP ?? "8m",
      HOLD: process.env.PERFORMANCE_HOLD ?? "10m",
      RAMP_DOWN: process.env.PERFORMANCE_RAMP_DOWN ?? "3m",
      PROTECTED_START: process.env.PERFORMANCE_PROTECTED_START ?? "1m",
      INVALID_START: process.env.PERFORMANCE_INVALID_START ?? "2m",
    });
  } else if (MODE === "performance:all") {
    artifacts.results.k6Matrix = MATRIX_LEVELS.map((vus) => ({
      vus,
      result: runK6(k6MatrixScriptForMode("public"), { VUS: String(vus), DURATION: process.env.PERFORMANCE_DURATION ?? "10m" }),
    }));
  }

  const blocked = [];
  for (const value of Object.values(artifacts.results)) {
    if (Array.isArray(value)) {
      blocked.push(...value.flatMap((item) => item.result?.status === "blocked" ? [item.result] : []));
    } else if (value?.status === "blocked") {
      blocked.push(value);
    }
  }
  artifacts.blocked = blocked;

  const hasFailedHttp = Object.values(artifacts.results).some((result) => result?.status === "fail");
  const hasBlocked = blocked.length > 0;
  artifacts.verdict = hasFailedHttp ? "FAIL" : hasBlocked ? "CONDITIONAL" : "PASS";

  writeJson("summary.json", artifacts);
  appendMarkdown("executive-summary.md", [
    `# DealFlow Performance Audit - ${artifacts.verdict}`,
    "",
    `- Generated: ${artifacts.generatedAt}`,
    `- Target: ${BASE_URL}`,
    `- Mode: ${MODE}`,
    `- Production-like target: ${artifacts.safety.productionLike}`,
    `- Writes enabled: ${artifacts.safety.allowWrites}`,
    `- k6 blocked: ${hasBlocked}`,
    "",
    "## Current Finding",
    hasBlocked
      ? "- The safe Node smoke/rate checks can run, but full 100-1000 VU k6 execution is blocked until k6 is installed and a safe staging/preview target is provided."
      : "- Configured performance run completed without harness blockers.",
    "",
    "## Side Effects",
    "- No real Stripe, Meta, SMS/email, provider generation, funnel publish, or launch actions are performed by default.",
    "",
  ].join("\n"));
  console.log(JSON.stringify(artifacts, null, 2));

  if (artifacts.verdict === "FAIL") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  mkdirp(REPORT_ROOT);
  writeJson("summary.json", {
    verdict: "FAIL",
    error: error instanceof Error ? error.message : String(error),
    generatedAt: NOW.toISOString(),
  });
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
