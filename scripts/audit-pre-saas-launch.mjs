#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  defaultProofRoot,
  ensureDir,
  parseArgs,
  writeProofArtifact,
} from "./write-proof-artifact.mjs";

const REQUIRED_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const OPTIONAL_ENV_NAMES = [
  "VERCEL_TOKEN",
  "META_APP_ID",
  "META_APP_SECRET",
  "META_QA_AD_ACCOUNT_ID",
  "META_QA_PAGE_ID",
  "META_QA_PIXEL_ID",
];

const REQUIRED_SCRIPT_STEPS = [
  "lint",
  "typecheck",
  "build",
  "smoke:offline",
  "routes:security",
  "schema:check",
  "plan:validate",
  "plan:writes:check",
  "rls:cross-tenant",
  "rls:fixture-smoke",
  "test:creative-chat-intake",
  "test:creative-render-state",
  "test:creative-media-readiness",
  "test:static-creative-image-qa",
  "test:higgsfield-provider-selection",
  "test:marketing-studio-worker",
  "test:video-generation-safety",
  "test:billing-free-trial",
  "test:subscription-lifecycle",
  "test:campaign-offboarding",
  "test:meta-app-state-drift",
  "test:meta-public-connect-readiness",
  "test:launch-budget-tracking-safety",
  "test:support-freshdesk",
  "test:client-error-telemetry",
  "test:public-self-serve-acceptance",
  "test:lead-notification-status",
  "test:internal-sms",
  "operator:debt",
];

function run(args, { allowFail = true } = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  if (!allowFail && result.status !== 0) {
    throw new Error(`${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function runTimeout({ command, proofDir, missionId, validationSuite, scriptName, timeoutMs = 300_000 }) {
  const args = [
    "node",
    "./scripts/run-with-timeout.mjs",
    "--mission-id",
    missionId,
    "--validation-suite",
    validationSuite,
    "--script-name",
    scriptName,
    "--proof-dir",
    proofDir,
    "--timeout-ms",
    String(timeoutMs),
    "--",
    ...command,
  ];
  const result = run(args);
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  return result.status ?? 1;
}

function writeSynthetic({ proofDir, missionId, validationSuite, scriptName, status, notes, routesChecked = [], screenshots = [] }) {
  const now = new Date().toISOString();
  const proofId = `${validationSuite}-${scriptName}-${now.replace(/[:.]/g, "-")}`.replace(/[^A-Za-z0-9_.-]/g, "-");
  const { filePath } = writeProofArtifact({
    proof_id: proofId,
    mission_id: missionId,
    started_at: now,
    finished_at: now,
    environment: "local",
    validation_suite: validationSuite,
    script_name: scriptName,
    command: "",
    status,
    duration_ms: 0,
    timeout_ms: 0,
    timed_out: false,
    exit_code: status === "pass" ? 0 : null,
    signal: null,
    routes_checked: routesChecked,
    screenshots,
    side_effects: "none",
    redaction_applied: true,
    notes,
  }, { proofDir });
  console.log(JSON.stringify({ script_name: scriptName, status, artifact_path: filePath, notes }));
  return status === "pass" ? 0 : 1;
}

function envPresence() {
  return {
    required: Object.fromEntries(REQUIRED_ENV_NAMES.map((name) => [name, Boolean(process.env[name]?.trim())])),
    optional: Object.fromEntries(OPTIONAL_ENV_NAMES.map((name) => [name, Boolean(process.env[name]?.trim())])),
  };
}

function readSummary(proofDir) {
  const summaryPath = path.join(proofDir, "proof-summary.json");
  if (!fs.existsSync(summaryPath)) return null;
  return JSON.parse(fs.readFileSync(summaryPath, "utf8"));
}

function writeFinalReport({ proofDir, missionId, browserMode }) {
  run(["npm", "run", "proof:latest", "--", "--proof-dir", proofDir]);
  const summary = readSummary(proofDir);
  const nonPass = summary?.failed_timeout_skipped_not_run ?? [];
  const critical = nonPass.filter((entry) => !/browser-proof|meta-proof/.test(entry.script_name ?? ""));
  const browserBlocked = browserMode !== "manual-complete";
  const status = critical.length === 0 && !browserBlocked ? "GO" : "NO-GO";
  const report = {
    status,
    mission_id: missionId,
    proof_directory: proofDir,
    artifact_count: summary?.artifact_count ?? 0,
    statuses: summary?.statuses ?? {},
    blocking_items: [
      ...critical.map((entry) => ({
        script_name: entry.script_name,
        status: entry.status,
        notes: entry.notes,
        artifact_path: entry.artifact_path,
      })),
      ...(browserBlocked
        ? [{
            script_name: "authenticated-browser-proof",
            status: "blocked",
            notes: "Run normal-browser fresh-account, Meta OAuth/select, desktop/mobile, action matrix proof and attach screenshots before GO.",
          }]
        : []),
    ],
    side_effects: [
      "no_deploy",
      "no_commit",
      "no_push",
      "no_provider_generation",
      "no_stripe_charge_or_session",
      "no_meta_mutation",
      "no_sms_or_email_send",
      "no_freshdesk_ticket",
      "no_funnel_publish",
      "no_launch",
    ],
    next_action: status === "GO"
      ? "Owner may review proof artifacts and proceed with controlled rollout."
      : "Clear all blocking_items, then rerun npm run audit:pre-saas-launch with browser proof artifacts attached.",
  };
  const finalReportPath = path.join(proofDir, "final-report.json");
  fs.writeFileSync(finalReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ final_verdict: status, final_report_path: finalReportPath }, null, 2));
  return status === "GO" ? 0 : 1;
}

function main() {
  const args = parseArgs();
  const missionId = args.missionId || `pre-saas-launch-${Date.now()}`;
  const proofDir = args.proofDir || process.env.ENGINEERING_OS_PROOF_DIR || path.join(defaultProofRoot(), missionId);
  const browserMode = args.browserMode || "not-run";
  const toolingSmoke = args.toolingSmoke === true || args.toolingSmoke === "true";
  ensureDir(proofDir);

  writeSynthetic({
    proofDir,
    missionId,
    validationSuite: "env",
    scriptName: "redacted-env-presence",
    status: Object.values(envPresence().required).every(Boolean) ? "pass" : "fail",
    notes: JSON.stringify(envPresence()),
  });

  runTimeout({
    command: ["sh", "-c", "pwd; git rev-parse HEAD; git branch --show-current; git remote -v; node -v; npm -v; test -f package-lock.json && echo package_manager=npm"],
    proofDir,
    missionId,
    validationSuite: "baseline",
    scriptName: "source-runtime",
    timeoutMs: 60_000,
  });
  const gitStatusExit = runTimeout({
    command: ["git", "status", "--short", "--branch"],
    proofDir,
    missionId,
    validationSuite: "baseline",
    scriptName: "git-status-short-branch",
    timeoutMs: 30_000,
  });
  const gitStatusNoUntrackedExit = runTimeout({
    command: ["git", "status", "-uno", "--short", "--branch"],
    proofDir,
    missionId,
    validationSuite: "baseline",
    scriptName: "git-status-no-untracked",
    timeoutMs: 30_000,
  });
  if (gitStatusExit !== 0 || gitStatusNoUntrackedExit !== 0) {
    writeSynthetic({
      proofDir,
      missionId,
      validationSuite: "baseline",
      scriptName: "git-provenance-fallback",
      status: "not_run",
      notes: "git status did not complete cleanly. Use git rev-parse HEAD, git branch --show-current, redacted remote proof, deploy marker, and explicit NO-GO source-provenance blocker until full dirty-file inventory is available.",
    });
  }

  runTimeout({
    command: ["npm", "run", "audit:secret-exposure"],
    proofDir,
    missionId,
    validationSuite: "security",
    scriptName: "audit-secret-exposure",
    timeoutMs: 180_000,
  });

  if (toolingSmoke) {
    writeSynthetic({
      proofDir,
      missionId,
      validationSuite: "validation",
      scriptName: "full-validation-suite",
      status: "not_run",
      notes: "tooling_smoke mode verifies the audit harness only. Run without --tooling-smoke for the full pre-SaaS launch audit.",
    });
  } else {
    for (const script of REQUIRED_SCRIPT_STEPS) {
      runTimeout({
        command: ["npm", "run", script],
        proofDir,
        missionId,
        validationSuite: "validation",
        scriptName: script,
        timeoutMs: script.startsWith("operator:") ? 180_000 : 300_000,
      });
    }
    runTimeout({
      command: ["npm", "run", "operator:scale-report", "--", "--json"],
      proofDir,
      missionId,
      validationSuite: "validation",
      scriptName: "operator:scale-report",
      timeoutMs: 180_000,
    });
    runTimeout({
      command: ["npm", "audit", "--audit-level=high"],
      proofDir,
      missionId,
      validationSuite: "security",
      scriptName: "npm-audit-high",
      timeoutMs: 180_000,
    });
    runTimeout({
      command: ["git", "diff", "--check"],
      proofDir,
      missionId,
      validationSuite: "baseline",
      scriptName: "git-diff-check",
      timeoutMs: 120_000,
    });
    run(["npm", "run", "validate:postdeploy", "--", "--mission-id", missionId, "--proof-dir", proofDir, "--base-url", "https://app.agentdealflow.io"]);
  }

  if (browserMode !== "manual-complete") {
    writeSynthetic({
      proofDir,
      missionId,
      validationSuite: "browser-proof",
      scriptName: "authenticated-browser-proof",
      status: "not_run",
      notes: "Requires normal Chrome fresh-account browser run, screenshots, console/network proof, action matrix, and QA-owned Meta OAuth/select proof.",
      routesChecked: [
        "/signup",
        "/login",
        "/dashboard",
        "/onboarding",
        "/build/creatives",
        "/preview",
        "/launch",
        "/settings",
      ],
    });
    writeSynthetic({
      proofDir,
      missionId,
      validationSuite: "meta-proof",
      scriptName: "qa-owned-meta-oauth-select-proof",
      status: "not_run",
      notes: "Requires QA-owned Meta OAuth/connect/select proof in normal browser. No campaign/adset/ad/budget/audience mutation allowed.",
    });
  }

  run(["npm", "run", "proof:verify", "--", "--proof-dir", proofDir]);
  process.exitCode = writeFinalReport({ proofDir, missionId, browserMode });
}

main();
