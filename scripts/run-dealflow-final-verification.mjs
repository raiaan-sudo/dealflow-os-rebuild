#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const outputArg = process.argv[2];
const round = process.argv[3] ?? "1";

if (!outputArg) {
  throw new Error("Usage: node scripts/run-dealflow-final-verification.mjs <external-output-directory> [round]");
}

const outputDirectory = path.resolve(outputArg);
const relativeToRoot = path.relative(root, outputDirectory);
if (
  relativeToRoot === "" ||
  (!relativeToRoot.startsWith(`..${path.sep}`) && relativeToRoot !== "..")
) {
  throw new Error("Verification evidence must be written outside the repository.");
}

const commands = [
  ["npm", ["run", "lint"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "test:dealflow-completion"]],
  ["npm", ["run", "test:media-buyer"]],
  ["npm", ["run", "test:media-buying-upgrades"]],
  ["npm", ["run", "test:media-buyer-regression"]],
  ["npm", ["run", "test:static-ad-templates"]],
  ["npm", ["run", "test:homepage"]],
  ["npm", ["run", "test:access-key-checkout-signup"]],
  ["npm", ["run", "test:public-funnel-thank-you"]],
  ["npm", ["run", "test:production-route-contract"]],
  ["npm", ["run", "smoke:offline"]],
  ["npm", ["run", "plan:validate"]],
  ["npm", ["run", "plan:writes:check"]],
  ["npm", ["run", "routes:security"]],
  ["node", ["scripts/check-tenant-isolation.mjs"]],
  ["node", ["scripts/test-migration-read-only-contract.mjs"]],
  ["npm", ["run", "test:release-guard"]],
  ["npm", ["run", "test:stripe-runtime-mode"]],
  ["npm", ["run", "test:access-key-security-disposable-db"]],
  ["npm", ["run", "test:meta-leadgen"]],
  ["npm", ["run", "test:financial-integrity-disposable-db"]],
  ["npm", ["run", "test:stripe-webhook-disposable-db"]],
  ["npm", ["run", "test:scheduler-disposable-db"]],
  ["npm", ["run", "test:creative-lead-disposable-db"]],
  ["npm", ["run", "test:ghl-disposable-db"]],
  ["npm", ["run", "test:lead-effect-fencing-db"]],
  ["npm", ["run", "test:campaign-entitlement-disposable-db"]],
  ["npm", ["run", "test:support-outbox-disposable-db"]],
  ["npm", ["run", "test:sms-receipts"]],
  ["node", ["scripts/test-lead-tracking-health.mjs"]],
];

function sanitize(text) {
  return String(text ?? "")
    .replace(/(authorization\s*:\s*bearer\s+)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/\b(?:sk|rk)_(?:live|test|proj)_[A-Za-z0-9_-]+\b/g, "[REDACTED_PROVIDER_KEY]")
    .replace(/\b(?:EAA|EAAB)[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_PROVIDER_TOKEN]")
    .replace(/\b(?:sb_secret_|sbp_)[A-Za-z0-9_-]+\b/g, "[REDACTED_SUPABASE_SECRET]")
    .replace(/\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*=\S+/g, (value) => `${value.split("=")[0]}=[REDACTED]`)
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]");
}

function safeEnvironment() {
  const names = [
    "PATH",
    "HOME",
    "TMPDIR",
    "USER",
    "LOGNAME",
    "SHELL",
    "LANG",
    "LC_ALL",
    "TERM",
    "COLORTERM",
    "NVM_DIR",
    "npm_config_cache",
  ];
  const env = { CI: "true", NO_COLOR: "1", NEXT_TELEMETRY_DISABLED: "1" };
  for (const name of names) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return env;
}

fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
const records = [];
let failed = false;

for (let index = 0; index < commands.length; index += 1) {
  const [executable, args] = commands[index];
  const command = [executable, ...args].join(" ");
  const startedAt = new Date();
  const startedMs = Date.now();
  process.stdout.write(`[verification round ${round}] ${command}\n`);
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: safeEnvironment(),
    maxBuffer: 64 * 1024 * 1024,
    timeout: 15 * 60_000,
  });
  const completedAt = new Date();
  const exitCode = result.status ?? (result.error ? 1 : 0);
  const logName = `${String(index + 1).padStart(2, "0")}-${args[1]?.replaceAll(":", "-") ?? path.basename(args[0] ?? executable)}.log`;
  const log = sanitize(
    [
      `command: ${command}`,
      `working_directory: ${root}`,
      `safe_environment_profile: provider credentials and application secrets omitted`,
      `started_at: ${startedAt.toISOString()}`,
      `completed_at: ${completedAt.toISOString()}`,
      `duration_ms: ${Date.now() - startedMs}`,
      `exit_code: ${exitCode}`,
      "",
      result.stdout ?? "",
      result.stderr ?? "",
      result.error ? `runner_error: ${result.error.message}` : "",
    ].join("\n"),
  );
  const logPath = path.join(outputDirectory, logName);
  fs.writeFileSync(logPath, log, { encoding: "utf8", mode: 0o600 });
  records.push({
    command,
    workingDirectory: root,
    safeEnvironmentProfile: "provider_credentials_and_application_secrets_omitted",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: Date.now() - startedMs,
    exitCode,
    status: exitCode === 0 ? "passed" : "failed",
    log: logName,
  });
  if (exitCode !== 0) failed = true;
}

const summary = {
  schemaVersion: "dealflow.final-verification.v1",
  round,
  runtime: process.version,
  platform: `${process.platform}-${process.arch}`,
  startedAt: records[0]?.startedAt ?? new Date().toISOString(),
  completedAt: records.at(-1)?.completedAt ?? new Date().toISOString(),
  commandCount: records.length,
  passedCount: records.filter((record) => record.status === "passed").length,
  failedCount: records.filter((record) => record.status === "failed").length,
  blockedCount: 0,
  records,
};
fs.writeFileSync(
  path.join(outputDirectory, "verification-summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  { encoding: "utf8", mode: 0o600 },
);

if (failed) {
  process.exitCode = 1;
}
