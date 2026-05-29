#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  defaultProofRoot,
  ensureDir,
  parseArgs,
  redactSensitiveText,
  writeProofArtifact,
  writeTextArtifact,
} from "./write-proof-artifact.mjs";

const DEFAULT_TIMEOUTS_MS = {
  lint: 180_000,
  typecheck: 300_000,
  build: 600_000,
  "smoke:offline": 300_000,
  "routes:security": 180_000,
  "operator:debt": 120_000,
  "operator:scale-report": 120_000,
  browser: 900_000,
  focused: 300_000,
  predeploy: 1_800_000,
  postdeploy: 300_000,
};

const PREDEPLOY_STEPS = [
  { scriptName: "lint", required: true },
  { scriptName: "typecheck", required: true },
  { scriptName: "build", required: true },
  { scriptName: "smoke:offline", required: true },
  { scriptName: "routes:security", required: true },
  { scriptName: "test:creative-chat-intake", required: false },
  { scriptName: "test:creative-media-readiness", required: false },
  { scriptName: "test:creative-render-state", required: false },
  { scriptName: "test:billing-free-trial", required: false },
  { scriptName: "test:subscription-lifecycle", required: false },
  { scriptName: "test:support-freshdesk", required: false },
  { command: ["git", "diff", "--check"], scriptName: "git:diff-check", required: true, timeoutMs: 120_000 },
];

const SAFE_POSTDEPLOY_PATHS = [
  { method: "GET", path: "/", expected: [200, 307, 308] },
  { method: "GET", path: "/login", expected: [200] },
  { method: "GET", path: "/signup", expected: [200, 307, 308] },
  { method: "GET", path: "/dashboard", expected: [302, 303, 307, 308, 401, 403] },
  { method: "GET", path: "/admin/control-room", expected: [302, 303, 307, 308, 401, 403] },
  {
    method: "POST",
    path: "/api/lead-capture",
    expected: [400, 401, 403, 422],
    body: { invalid: true },
    headers: { "content-type": "application/json" },
  },
  {
    method: "POST",
    path: "/api/stripe/webhook",
    expected: [400, 401, 403],
    body: { type: "invalid.probe" },
    headers: { "content-type": "application/json" },
  },
  {
    method: "POST",
    path: "/api/webhooks/twilio/status",
    expected: [400, 401, 403],
    body: "MessageSid=SM_SAFE_PROBE&MessageStatus=failed",
    headers: { "content-type": "application/x-www-form-urlencoded" },
  },
  {
    method: "POST",
    path: "/api/support/ticket",
    expected: [401, 403],
    body: { category: "report_bug", message: "safe unauthenticated probe" },
    headers: { "content-type": "application/json" },
  },
  { method: "GET", path: "/api/internal/system-jobs", expected: [401, 403, 405] },
  { method: "POST", path: "/api/internal/qa-auth-session", expected: [401, 403, 404] },
];

function readPackageScripts(cwd = process.cwd()) {
  const packagePath = path.join(cwd, "package.json");
  if (!fs.existsSync(packagePath)) return {};
  return JSON.parse(fs.readFileSync(packagePath, "utf8")).scripts ?? {};
}

function parseTimeoutMs(args, fallbackKey = "focused") {
  if (args.timeoutMs) return Number.parseInt(args.timeoutMs, 10);
  if (args.timeoutSeconds) return Number.parseInt(args.timeoutSeconds, 10) * 1000;
  return DEFAULT_TIMEOUTS_MS[fallbackKey] ?? DEFAULT_TIMEOUTS_MS.focused;
}

function shellQuote(parts) {
  return parts.map((part) => {
    if (/^[A-Za-z0-9_./:=@+-]+$/.test(part)) return part;
    return `'${part.replaceAll("'", "'\\''")}'`;
  }).join(" ");
}

function commandForScript(scriptName) {
  return ["npm", "run", scriptName];
}

function summarizeStatus(status, exitCode, timedOut) {
  if (timedOut) return "timeout";
  if (exitCode === 0) return "pass";
  return "fail";
}

async function runCommand({
  command,
  scriptName,
  validationSuite,
  missionId,
  environment,
  proofDir,
  timeoutMs,
  required = true,
  notes = "",
}) {
  ensureDir(proofDir);
  const startedAt = new Date();
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let exitCode = null;
  let signal = null;

  const child = spawn(command[0], command.slice(1), {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      child.kill("SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
          // The process may already have exited between the check and kill.
        }
      }
    }, 2_000).unref();
  }, timeoutMs);

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  await new Promise((resolve) => {
    child.on("error", (error) => {
      stderr += `${error.message}\n`;
      exitCode = 1;
      clearTimeout(timeout);
      resolve();
    });
    child.on("exit", (code, sig) => {
      exitCode = code;
      signal = sig;
      clearTimeout(timeout);
      resolve();
    });
  });

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const status = summarizeStatus(timedOut ? "timeout" : null, exitCode, timedOut);
  const proofId = `${validationSuite ?? "command"}-${scriptName ?? command[0]}-${startedAt.toISOString().replace(/[:.]/g, "-")}`.replace(/[^A-Za-z0-9_.-]/g, "-");
  const stdoutPath = writeTextArtifact({
    proofDir,
    subdir: "stdout",
    name: `${proofId}.stdout.txt`,
    text: stdout,
  });
  const stderrPath = writeTextArtifact({
    proofDir,
    subdir: "stderr",
    name: `${proofId}.stderr.txt`,
    text: stderr,
  });
  const { filePath } = writeProofArtifact({
    proof_id: proofId,
    mission_id: missionId,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    environment,
    validation_suite: validationSuite,
    script_name: scriptName,
    command: shellQuote(command),
    status,
    duration_ms: durationMs,
    timeout_ms: timeoutMs,
    timed_out: timedOut,
    exit_code: exitCode,
    signal,
    stdout_path: stdoutPath,
    stderr_path: stderrPath,
    side_effects: "none",
    redaction_applied: true,
    notes: notes || (required ? "" : "optional command"),
  }, { proofDir });

  console.log(JSON.stringify({
    script_name: scriptName,
    command: shellQuote(command),
    status,
    duration_ms: durationMs,
    timeout_ms: timeoutMs,
    artifact_path: filePath,
  }));
  return { status, exitCode, timedOut, artifactPath: filePath, required };
}

function writeSyntheticArtifact({ status, notes, scriptName, validationSuite, missionId, environment, proofDir }) {
  const now = new Date().toISOString();
  const proofId = `${validationSuite ?? "suite"}-${scriptName}-${now.replace(/[:.]/g, "-")}`.replace(/[^A-Za-z0-9_.-]/g, "-");
  const { filePath } = writeProofArtifact({
    proof_id: proofId,
    mission_id: missionId,
    started_at: now,
    finished_at: now,
    environment,
    validation_suite: validationSuite,
    script_name: scriptName,
    command: "",
    status,
    duration_ms: 0,
    timeout_ms: 0,
    timed_out: false,
    exit_code: status === "pass" ? 0 : null,
    signal: null,
    stdout_path: null,
    stderr_path: null,
    side_effects: "none",
    redaction_applied: true,
    notes,
  }, { proofDir });
  console.log(JSON.stringify({ script_name: scriptName, status, artifact_path: filePath, notes }));
  return { status, artifactPath: filePath, required: false };
}

async function runPredeploySuite(args) {
  const scripts = readPackageScripts();
  const missionId = args.missionId ?? `predeploy-${Date.now()}`;
  const proofDir = args.proofDir ?? process.env.ENGINEERING_OS_PROOF_DIR ?? defaultProofRoot();
  const results = [];
  for (const step of PREDEPLOY_STEPS) {
    if (step.command) {
      results.push(await runCommand({
        command: step.command,
        scriptName: step.scriptName,
        validationSuite: "predeploy",
        missionId,
        environment: args.environment ?? "local",
        proofDir,
        timeoutMs: step.timeoutMs ?? parseTimeoutMs(args, step.scriptName),
        required: step.required,
      }));
      continue;
    }
    if (!scripts[step.scriptName]) {
      const status = step.required ? "fail" : "skipped";
      results.push(writeSyntheticArtifact({
        status,
        notes: "script_not_defined",
        scriptName: step.scriptName,
        validationSuite: "predeploy",
        missionId,
        environment: args.environment ?? "local",
        proofDir,
      }));
      continue;
    }
    results.push(await runCommand({
      command: commandForScript(step.scriptName),
      scriptName: step.scriptName,
      validationSuite: "predeploy",
      missionId,
      environment: args.environment ?? "local",
      proofDir,
      timeoutMs: step.timeoutMs ?? parseTimeoutMs(args, step.scriptName),
      required: step.required,
    }));
  }
  const failed = results.filter((result) => ["fail", "timeout"].includes(result.status) || (result.required && result.status !== "pass"));
  return failed.length === 0 ? 0 : 1;
}

function resolvePostdeployBaseUrl(args) {
  return args.baseUrl || process.env.POSTDEPLOY_BASE_URL || process.env.SAFE_POSTDEPLOY_BASE_URL || null;
}

async function runPostdeploySuite(args) {
  const missionId = args.missionId ?? `postdeploy-${Date.now()}`;
  const proofDir = args.proofDir ?? process.env.ENGINEERING_OS_PROOF_DIR ?? defaultProofRoot();
  const baseUrl = resolvePostdeployBaseUrl(args);
  if (!baseUrl) {
    writeSyntheticArtifact({
      status: "not_run",
      notes: "deploy_target_missing",
      scriptName: "validate:postdeploy",
      validationSuite: "postdeploy",
      missionId,
      environment: args.environment ?? "production",
      proofDir,
    });
    return 0;
  }

  const startedAt = new Date();
  const routesChecked = [];
  let stdout = "";
  let stderr = "";
  let failed = false;
  for (const probe of SAFE_POSTDEPLOY_PATHS) {
    const url = new URL(probe.path, baseUrl).toString();
    try {
      const response = await fetch(url, {
        method: probe.method,
        headers: probe.headers,
        body: probe.body
          ? typeof probe.body === "string"
            ? probe.body
            : JSON.stringify(probe.body)
          : undefined,
        redirect: "manual",
      });
      const routeResult = {
        method: probe.method,
        path: probe.path,
        status: response.status,
        expected: probe.expected,
        pass: probe.expected.includes(response.status),
      };
      routesChecked.push(routeResult);
      stdout += `${probe.method} ${probe.path} -> ${response.status}\n`;
      if (!routeResult.pass) failed = true;
    } catch (error) {
      failed = true;
      routesChecked.push({
        method: probe.method,
        path: probe.path,
        status: "error",
        expected: probe.expected,
        pass: false,
      });
      stderr += `${probe.method} ${probe.path} -> ${error instanceof Error ? error.message : "probe_failed"}\n`;
    }
  }
  const finishedAt = new Date();
  const proofId = `postdeploy-safe-probes-${startedAt.toISOString().replace(/[:.]/g, "-")}`;
  const stdoutPath = writeTextArtifact({ proofDir, subdir: "stdout", name: `${proofId}.stdout.txt`, text: stdout });
  const stderrPath = writeTextArtifact({ proofDir, subdir: "stderr", name: `${proofId}.stderr.txt`, text: stderr });
  const { filePath } = writeProofArtifact({
    proof_id: proofId,
    mission_id: missionId,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    environment: args.environment ?? "production",
    validation_suite: "postdeploy",
    script_name: "validate:postdeploy",
    command: `safe postdeploy probes against ${baseUrl}`,
    status: failed ? "fail" : "pass",
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    timeout_ms: parseTimeoutMs(args, "postdeploy"),
    timed_out: false,
    exit_code: failed ? 1 : 0,
    signal: null,
    stdout_path: stdoutPath,
    stderr_path: stderrPath,
    routes_checked: routesChecked,
    side_effects: "none",
    redaction_applied: true,
    notes: "safe GET and intentionally invalid or unsigned POST probes only",
  }, { proofDir });
  console.log(JSON.stringify({ script_name: "validate:postdeploy", status: failed ? "fail" : "pass", artifact_path: filePath }));
  return failed ? 1 : 0;
}

async function runSelfTest(args) {
  const proofDir = args.proofDir ?? path.join(defaultProofRoot(), "self-test");
  const missionId = args.missionId ?? "engineering-os-v1-self-test";
  const results = [];
  results.push(await runCommand({
    command: [process.execPath, "-e", "console.log('ok')"],
    scriptName: "self-test-pass",
    validationSuite: "self-test",
    missionId,
    environment: "local",
    proofDir,
    timeoutMs: 5000,
  }));
  results.push(await runCommand({
    command: [process.execPath, "-e", "process.exit(7)"],
    scriptName: "self-test-fail",
    validationSuite: "self-test",
    missionId,
    environment: "local",
    proofDir,
    timeoutMs: 5000,
  }));
  results.push(await runCommand({
    command: [process.execPath, "-e", "setTimeout(()=>{}, 5000)"],
    scriptName: "self-test-timeout",
    validationSuite: "self-test",
    missionId,
    environment: "local",
    proofDir,
    timeoutMs: 500,
  }));
  results.push(writeSyntheticArtifact({
    status: "skipped",
    notes: "self_test_skip_reason",
    scriptName: "self-test-skipped",
    validationSuite: "self-test",
    missionId,
    environment: "local",
    proofDir,
  }));
  const expected = ["pass", "fail", "timeout", "skipped"];
  const actual = results.map((result) => result.status);
  const ok = expected.every((status) => actual.includes(status));
  console.log(JSON.stringify({ self_test: ok ? "pass" : "fail", proof_dir: proofDir, statuses: actual }));
  return ok ? 0 : 1;
}

async function main() {
  const args = parseArgs();
  if (args.selfTest) {
    process.exitCode = await runSelfTest(args);
    return;
  }
  if (args.suite === "predeploy") {
    process.exitCode = await runPredeploySuite(args);
    return;
  }
  if (args.suite === "postdeploy") {
    process.exitCode = await runPostdeploySuite(args);
    return;
  }
  if (args.skip || args.notRun) {
    writeSyntheticArtifact({
      status: args.notRun ? "not_run" : "skipped",
      notes: args.reason ?? args.notes ?? (args.notRun ? "not_run" : "skipped"),
      scriptName: args.scriptName ?? "manual",
      validationSuite: args.validationSuite ?? null,
      missionId: args.missionId ?? "engineering-os-v1",
      environment: args.environment ?? "local",
      proofDir: args.proofDir ?? process.env.ENGINEERING_OS_PROOF_DIR ?? defaultProofRoot(),
    });
    return;
  }
  const command = args._?.length ? args._ : args.scriptName ? commandForScript(args.scriptName) : [];
  if (command.length === 0) {
    console.error("No command provided. Use -- <command> or --script-name <npm-script>.");
    process.exitCode = 2;
    return;
  }
  const result = await runCommand({
    command,
    scriptName: args.scriptName ?? command[0],
    validationSuite: args.validationSuite ?? null,
    missionId: args.missionId ?? "engineering-os-v1",
    environment: args.environment ?? "local",
    proofDir: args.proofDir ?? process.env.ENGINEERING_OS_PROOF_DIR ?? defaultProofRoot(),
    timeoutMs: parseTimeoutMs(args, args.scriptName ?? "focused"),
    required: args.required !== "false",
    notes: args.notes ?? "",
  });
  if (!args.continueOnError && ["fail", "timeout"].includes(result.status)) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(redactSensitiveText(error instanceof Error ? error.stack ?? error.message : String(error)));
    process.exit(1);
  });
}
