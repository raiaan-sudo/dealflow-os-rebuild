#!/usr/bin/env node
import nextEnv from "@next/env";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const repoRoot = process.env.DEALFLOW_REPO_ROOT || process.cwd();
const { loadEnvConfig } = nextEnv;
loadEnvConfig(repoRoot);

const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

Module._load = function load(request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }

  return originalLoad.call(this, request, parent, isMain);
};

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolve.call(
      this,
      path.join(repoRoot, "src", request.slice(2)),
      parent,
      isMain,
      options,
    );
  }

  return originalResolve.call(this, request, parent, isMain, options);
};

Module._extensions[".ts"] = function loadTs(module, filename) {
  const source = ts.sys.readFile(filename);
  const output = ts.transpileModule(source ?? "", {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
    fileName: filename,
  });

  module._compile(output.outputText, filename);
};

const require = createRequire(import.meta.url);
const {
  getMarketingStudioWorkerReadiness,
  runMarketingStudioWorkerBatch,
} = require("../src/lib/services/marketing-studio-worker-service.ts");

function parseArgs(argv) {
  const options = {
    dryRun: false,
    maxJobs: 1,
    poll: false,
    intervalMs: 5_000,
  };

  for (const arg of argv) {
    if (arg === "--dry-run" || arg === "--readiness") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--poll") {
      options.poll = true;
      continue;
    }

    if (arg.startsWith("--max-jobs=")) {
      const value = Number(arg.slice("--max-jobs=".length));
      if (Number.isInteger(value) && value > 0) {
        options.maxJobs = Math.min(value, 10);
      }
      continue;
    }

    if (arg.startsWith("--interval-ms=")) {
      const value = Number(arg.slice("--interval-ms=".length));
      if (Number.isInteger(value) && value >= 5_000) {
        options.intervalMs = value;
      }
    }
  }

  return options;
}

function log(level, event, payload) {
  process.stdout.write(`${JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  })}\n`);
}

function getCommitSha() {
  const explicit = process.env.DEALFLOW_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA;

  if (explicit) {
    return explicit;
  }

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

async function logStartupFingerprint(options) {
  const readiness = await getMarketingStudioWorkerReadiness();
  log("info", "marketing_studio_worker.startup", {
    commitSha: getCommitSha(),
    runtime: readiness.runtime,
    poll: options.poll,
    intervalMs: options.intervalMs,
    maxJobs: options.maxJobs,
    ready: readiness.ready,
    checks: readiness.checks,
    missing: readiness.missing,
  });
}

async function runOnce(options) {
  const readiness = await getMarketingStudioWorkerReadiness();
  log(readiness.ready ? "info" : "warn", "marketing_studio_worker.readiness", {
    ready: readiness.ready,
    runtime: readiness.runtime,
    checks: readiness.checks,
    missing: readiness.missing,
  });

  if (!readiness.ready) {
    process.exitCode = 1;
    return;
  }

  const result = await runMarketingStudioWorkerBatch({
    maxJobs: options.maxJobs,
    dryRun: options.dryRun,
  });
  log("info", "marketing_studio_worker.batch", result);
}

const options = parseArgs(process.argv.slice(2));

try {
  await logStartupFingerprint(options);

  if (options.poll) {
    // Long-running operator process. Keep the loop simple so supervisors can
    // restart on crash and collect one JSON line per cycle.
    for (;;) {
      await runOnce(options);
      if (process.exitCode && process.exitCode !== 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
    }
  } else {
    await runOnce(options);
  }
} catch (error) {
  log("error", "marketing_studio_worker.fatal", {
    message: error instanceof Error ? error.message : "Marketing Studio worker failed.",
  });
  process.exitCode = 1;
}
