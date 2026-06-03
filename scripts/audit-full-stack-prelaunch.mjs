#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, "-");
const date = now.toISOString().slice(0, 10);
const proofDir = path.join(root, "data", "engineering-proof-artifacts", date, `full-stack-prelaunch-audit-${stamp}`);
fs.mkdirSync(proofDir, { recursive: true });

const includeExternal = process.env.FULL_STACK_AUDIT_EXTERNAL === "1";
const includeProduction = process.env.FULL_STACK_AUDIT_PRODUCTION === "1";
const includeStrict = process.env.FULL_STACK_AUDIT_STRICT === "1";
const includeDataIsolation = includeStrict || process.env.FULL_STACK_AUDIT_DATA_ISOLATION === "1";
const includeBrowser = includeStrict || process.env.FULL_STACK_AUDIT_BROWSER === "1";
const baseUrl = process.env.PRELAUNCH_BASE_URL ?? "https://app.agentdealflow.io";

function loadLocalEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const equalsAt = trimmed.indexOf("=");
    const key = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

for (const envFile of [".env.production.local", ".env.local", ".env"]) {
  loadLocalEnvFile(path.join(root, envFile));
}

function writePreflightNoGo({ missing, reason }) {
  const report = {
    status: "NO_GO",
    proofDirectory: proofDir,
    baseUrl,
    includeExternal,
    includeProduction,
    includeStrict,
    includeDataIsolation,
    includeBrowser,
    commands: [],
    blocked: [
      {
        gate: "strict_env_preflight",
        missing,
        reason,
      },
    ],
    skipped: [
      "audit commands skipped because required strict production/data-isolation environment variables are not loaded locally",
    ],
    unsafeActions: [
      "no launch",
      "no Meta mutation",
      "no Stripe checkout/charge",
      "no SMS/email",
      "no Freshdesk ticket",
      "no provider generation",
      "no funnel publish",
    ],
    nextAction:
      "Load NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY locally without pasting secrets, then rerun the strict audit.",
  };
  const reportPath = path.join(proofDir, "final-report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`\nStrict audit preflight failed: ${reason}`);
  console.error(`Missing required env: ${missing.join(", ")}`);
  console.error(`Proof directory: ${proofDir}`);
  console.error(`Final report: ${reportPath}`);
  process.exit(1);
}

if (includeProduction || includeDataIsolation) {
  const requiredSupabaseEnv = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const missing = requiredSupabaseEnv.filter((key) => !String(process.env[key] ?? "").trim());
  if (missing.length > 0) {
    writePreflightNoGo({
      missing,
      reason:
        "Strict production/data-isolation audit requires local Supabase env values. The current local env is missing or contains blank pulled values.",
    });
  }
}

const commands = [
  ["git", ["status", "--no-ahead-behind", "--short", "--branch"], "source_status"],
  ["npm", ["run", "lint"], "lint"],
  ["npm", ["run", "typecheck"], "typecheck"],
  ["npm", ["run", "build"], "build"],
  ["npm", ["run", "smoke:offline"], "smoke_offline"],
  ["npm", ["run", "audit:security-coverage"], "security_coverage_matrix"],
  ["npm", ["run", "routes:security"], "routes_security"],
  ["npm", ["run", "audit:secret-exposure"], "secret_exposure"],
  ["npm", ["run", "plan:writes:check"], "plan_writes"],
  ["npm", ["run", "schema:check"], "schema_check"],
  ["npm", ["run", "test:creative-chat-intake"], "creative_chat_intake"],
  ["npm", ["run", "test:creative-render-state"], "creative_render_state"],
  ["npm", ["run", "test:creative-media-readiness"], "creative_media_readiness"],
  ["npm", ["run", "test:static-creative-image-qa"], "static_creative_image_qa"],
  ["npm", ["run", "test:static-creative-storage-normalization"], "static_creative_storage_normalization"],
  ["npm", ["run", "test:client-error-telemetry"], "client_error_telemetry"],
  ["npm", ["run", "test:public-self-serve-acceptance"], "public_self_serve_acceptance"],
  ["npm", ["run", "test:partner-branded-billing"], "partner_branded_billing"],
  ["npm", ["run", "test-white-label-foundation"], "white_label_foundation"],
  ["npm", ["run", "test:subscription-lifecycle"], "subscription_lifecycle"],
  ["npm", ["run", "test:stripe-price-guard"], "stripe_price_guard"],
  ["npm", ["run", "test:performance-billing"], "performance_billing"],
  ["npm", ["run", "test:campaign-offboarding"], "campaign_offboarding"],
  ["npm", ["run", "test:launch-budget-tracking-safety"], "launch_budget_tracking_safety"],
  ["npm", ["run", "test:meta-app-state-drift"], "meta_app_state_drift"],
  ["npm", ["run", "test:lead-notification-status"], "lead_notification_status"],
  ["npm", ["run", "test:support-freshdesk"], "support_freshdesk"],
  ["npm", ["audit", "--audit-level=high"], "npm_audit_high"],
  ["git", ["diff", "--check"], "git_diff_check"],
];

if (includeDataIsolation) {
  const insertAt = commands.findIndex((item) => item[2] === "schema_check") + 1;
  commands.splice(
    insertAt,
    0,
    ["npm", ["run", "rls:cross-tenant"], "rls_cross_tenant"],
    ["npm", ["run", "rls:fixture-smoke"], "rls_fixture_smoke"],
  );
}

if (includeBrowser) {
  const insertAt = commands.findIndex((item) => item[2] === "public_self_serve_acceptance") + 1;
  commands.splice(insertAt, 0, ["npm", ["run", "test:e2e:safe"], "safe_authenticated_browser_e2e"]);
}

if (includeProduction) {
  commands.push(
    ["npm", ["run", "operator:debt"], "operator_debt"],
    ["npm", ["run", "operator:scale-report", "--", "--json"], "operator_scale_report"],
    ["npm", ["run", "validate:postdeploy", "--", "--base-url", baseUrl], "postdeploy_validation"],
  );
}

if (includeExternal) {
  commands.push(
    ["npm", ["run", "audit:semgrep"], "semgrep"],
    ["npm", ["run", "audit:lighthouse"], "lighthouse"],
  );

  if (process.env.ZAP_TARGET_URL || process.env.PRELAUNCH_BASE_URL) {
    commands.push(["npm", ["run", "audit:zap:baseline"], "zap_baseline"]);
  }
}

function runCommand([cmd, args, id]) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const outPath = path.join(proofDir, `${id}.log`);
    const output = fs.createWriteStream(outPath);
    const child = spawn(cmd, args, {
      cwd: root,
      env: {
        ...process.env,
        ENGINEERING_OS_PROOF_DIR: proofDir,
        PRELAUNCH_BASE_URL: baseUrl,
        SUPABASE_SCHEMA_CHECK_MODE:
          process.env.SUPABASE_SCHEMA_CHECK_MODE ?? (includeDataIsolation || includeProduction ? "remote" : "local"),
      },
      shell: false,
    });
    const timeoutMs = Number(process.env.FULL_STACK_AUDIT_TIMEOUT_MS ?? 900000);
    const timer = setTimeout(() => {
      output.write(`\nTIMEOUT after ${timeoutMs}ms\n`);
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      output.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      output.write(chunk);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      output.end();
      resolve({
        id,
        command: [cmd, ...args].join(" "),
        status: code === 0 ? "PASS" : "FAIL",
        code,
        signal,
        startedAt,
        finishedAt: new Date().toISOString(),
        log: outPath,
      });
    });
  });
}

const results = [];
for (const command of commands) {
  console.log(`\n== ${command[2]} ==`);
  const result = await runCommand(command);
  results.push(result);
  if (result.status !== "PASS") {
    break;
  }
}

const report = {
  status: results.every((item) => item.status === "PASS") ? "FULL_GO" : "NO_GO",
  proofDirectory: proofDir,
  baseUrl,
  includeExternal,
  includeProduction,
  includeStrict,
  includeDataIsolation,
  includeBrowser,
  commands: results,
  skipped: [
    ...(includeExternal ? [] : ["external scanners skipped; set FULL_STACK_AUDIT_EXTERNAL=1 to run Semgrep/Lighthouse/ZAP"]),
    ...(includeProduction ? [] : ["production operator/postdeploy checks skipped; set FULL_STACK_AUDIT_PRODUCTION=1 to run them"]),
    ...(includeDataIsolation ? [] : ["live cross-tenant RLS/fixture proof skipped; set FULL_STACK_AUDIT_DATA_ISOLATION=1 or FULL_STACK_AUDIT_STRICT=1"]),
    ...(includeBrowser ? [] : ["authenticated browser walkthrough skipped; set FULL_STACK_AUDIT_BROWSER=1 or FULL_STACK_AUDIT_STRICT=1"]),
  ],
  unsafeActions: [
    "no launch",
    "no Meta mutation",
    "no Stripe checkout/charge",
    "no SMS/email",
    "no Freshdesk ticket",
    "no provider generation",
    "no funnel publish",
  ],
};

const reportPath = path.join(proofDir, "final-report.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nFinal status: ${report.status}`);
console.log(`Proof directory: ${proofDir}`);
console.log(`Final report: ${reportPath}`);
process.exit(report.status === "FULL_GO" ? 0 : 1);
