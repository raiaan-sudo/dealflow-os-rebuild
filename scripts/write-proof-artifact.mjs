#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const VALID_STATUSES = new Set(["pass", "fail", "timeout", "skipped", "not_run"]);
const VALID_ENVIRONMENTS = new Set(["local", "preview", "production", "ci"]);
const VALID_PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "unknown"]);

export function isoNow() {
  return new Date().toISOString();
}

export function dateSegment(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function defaultProofRoot(cwd = process.cwd()) {
  return path.join(cwd, "data", "engineering-proof-artifacts", dateSegment());
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      rest.push(...argv.slice(index + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      rest.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  args._ = rest;
  return args;
}

const repoContextCache = new Map();

function safeExec(args, fallback = null) {
  try {
    return execFileSync(args[0], args.slice(1), {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

export function detectPackageManager(cwd = process.cwd()) {
  if (fs.existsSync(path.join(cwd, "package-lock.json"))) return "npm";
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) return "yarn";
  return "unknown";
}

export function redactGitRemote(remote) {
  if (!remote) return null;
  return remote
    .replace(/(https?:\/\/)([^/@]+)@/g, "$1***@")
    .replace(/(https:\/\/github\.com\/)([^/]+)\//g, "$1***/")
    .replace(/(git@github\.com:)([^/]+)\//g, "$1***/");
}

export function collectRepoContext(cwd = process.cwd()) {
  if (repoContextCache.has(cwd)) {
    return repoContextCache.get(cwd);
  }
  const context = {
    repo_path: cwd,
    git_remote_url_redacted: redactGitRemote(safeExec(["git", "remote", "get-url", "origin"])),
    commit_sha: safeExec(["git", "rev-parse", "HEAD"]),
    branch: safeExec(["git", "branch", "--show-current"]),
    package_manager: detectPackageManager(cwd),
    node_version: process.version,
    npm_version: safeExec(["npm", "-v"]),
  };
  repoContextCache.set(cwd, context);
  return context;
}

export function redactSensitiveText(value) {
  if (!value) return "";
  let text = String(value);
  const replacements = [
    [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]"],
    [/(authorization\s*[:=]\s*)[^\s"'`]+/gi, "$1[REDACTED]"],
    [/(api[_-]?key\s*[:=]\s*)[^\s"'`]+/gi, "$1[REDACTED]"],
    [/(secret\s*[:=]\s*)[^\s"'`]+/gi, "$1[REDACTED]"],
    [/(token\s*[:=]\s*)[^\s"'`]+/gi, "$1[REDACTED]"],
    [/(password\s*[:=]\s*)[^\s"'`]+/gi, "$1[REDACTED]"],
    [/(cookie\s*[:=]\s*)[^\n]+/gi, "$1[REDACTED]"],
    [/(set-cookie\s*[:=]\s*)[^\n]+/gi, "$1[REDACTED]"],
    [/\b(sk_live|sk_test|pk_live|pk_test)_[A-Za-z0-9_]+\b/g, "[REDACTED_STRIPE_KEY]"],
    [/\b(hf|hf_live|hf_test)_[A-Za-z0-9_=-]{12,}\b/gi, "[REDACTED_PROVIDER_KEY]"],
    [/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]"],
    [/\b[A-Za-z0-9_=-]{48,}\b/g, "[REDACTED_LONG_TOKEN]"],
    [/([?&](?:X-Amz-Signature|token|signature|sig|access_token)=)[^&\s]+/gi, "$1[REDACTED]"],
  ];
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

export function writeTextArtifact({ proofDir, subdir, name, text }) {
  if (text === null || text === undefined) return null;
  const dir = path.join(proofDir, subdir);
  ensureDir(dir);
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, redactSensitiveText(text), "utf8");
  return filePath;
}

export function createProofArtifact(input) {
  const cwd = input.repo_path ?? process.cwd();
  const context = collectRepoContext(cwd);
  const createdAt = input.created_at ?? isoNow();
  const proofId = input.proof_id ?? `proof-${createdAt.replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  const artifact = {
    artifact_version: "1.0",
    proof_id: proofId,
    mission_id: input.mission_id ?? "engineering-os-v1",
    created_at: createdAt,
    started_at: input.started_at ?? null,
    finished_at: input.finished_at ?? null,
    repo_path: input.repo_path ?? context.repo_path ?? null,
    git_remote_url_redacted: input.git_remote_url_redacted ?? context.git_remote_url_redacted ?? null,
    commit_sha: input.commit_sha ?? context.commit_sha ?? null,
    branch: input.branch ?? context.branch ?? null,
    package_manager: input.package_manager ?? context.package_manager ?? "unknown",
    node_version: input.node_version ?? context.node_version ?? null,
    npm_version: input.npm_version ?? context.npm_version ?? null,
    environment: input.environment ?? "local",
    validation_suite: input.validation_suite ?? null,
    script_name: input.script_name ?? null,
    command: input.command ?? "",
    status: input.status ?? "not_run",
    duration_ms: Number(input.duration_ms ?? 0),
    timeout_ms: Number(input.timeout_ms ?? 0),
    timed_out: Boolean(input.timed_out),
    exit_code: input.exit_code === null || input.exit_code === undefined ? null : Number(input.exit_code),
    signal: input.signal ?? null,
    stdout_path: input.stdout_path ?? null,
    stderr_path: input.stderr_path ?? null,
    deploy_id: input.deploy_id ?? null,
    routes_checked: Array.isArray(input.routes_checked) ? input.routes_checked : [],
    screenshots: Array.isArray(input.screenshots) ? input.screenshots : [],
    side_effects: input.side_effects ?? "none",
    redaction_applied: input.redaction_applied ?? true,
    notes: input.notes ?? "",
  };

  if (!VALID_STATUSES.has(artifact.status)) {
    throw new Error(`Invalid proof artifact status: ${artifact.status}`);
  }
  if (!VALID_ENVIRONMENTS.has(artifact.environment)) {
    throw new Error(`Invalid proof artifact environment: ${artifact.environment}`);
  }
  if (!VALID_PACKAGE_MANAGERS.has(artifact.package_manager)) {
    artifact.package_manager = "unknown";
  }
  if ((artifact.status === "skipped" || artifact.status === "not_run") && !artifact.notes) {
    throw new Error(`${artifact.status} proof artifacts require notes`);
  }
  return artifact;
}

export function writeProofArtifact(input, options = {}) {
  const proofDir = options.proofDir ?? input.proof_dir ?? process.env.ENGINEERING_OS_PROOF_DIR ?? defaultProofRoot();
  ensureDir(proofDir);
  const artifact = createProofArtifact(input);
  const filePath = options.filePath ?? path.join(proofDir, `${artifact.proof_id}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return { artifact, filePath, proofDir };
}

function coerceCliInput(args) {
  return {
    proof_id: args.proofId,
    mission_id: args.missionId,
    started_at: args.startedAt ?? null,
    finished_at: args.finishedAt ?? null,
    environment: args.environment,
    validation_suite: args.validationSuite,
    script_name: args.scriptName,
    command: args.command ?? args._?.join(" ") ?? "",
    status: args.status,
    duration_ms: args.durationMs,
    timeout_ms: args.timeoutMs,
    timed_out: args.timedOut === true || args.timedOut === "true",
    exit_code: args.exitCode === "null" ? null : args.exitCode,
    signal: args.signal === "null" ? null : args.signal,
    stdout_path: args.stdoutPath === "null" ? null : args.stdoutPath,
    stderr_path: args.stderrPath === "null" ? null : args.stderrPath,
    deploy_id: args.deployId === "null" ? null : args.deployId,
    side_effects: args.sideEffects,
    redaction_applied: args.redactionApplied !== "false",
    notes: args.notes,
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const args = parseArgs();
  const { filePath } = writeProofArtifact(coerceCliInput(args), {
    proofDir: args.proofDir,
    filePath: args.output,
  });
  console.log(JSON.stringify({ status: "pass", artifact_path: filePath }));
}
