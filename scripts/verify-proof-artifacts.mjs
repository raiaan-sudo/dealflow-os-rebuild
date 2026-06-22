#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { defaultProofRoot, parseArgs } from "./write-proof-artifact.mjs";

const REQUIRED_FIELDS = [
  "artifact_version",
  "proof_id",
  "mission_id",
  "created_at",
  "repo_path",
  "git_remote_url_redacted",
  "commit_sha",
  "branch",
  "package_manager",
  "node_version",
  "npm_version",
  "environment",
  "command",
  "status",
  "duration_ms",
  "timeout_ms",
  "timed_out",
  "exit_code",
  "signal",
  "stdout_path",
  "stderr_path",
  "deploy_id",
  "routes_checked",
  "screenshots",
  "side_effects",
  "redaction_applied",
  "notes",
];
const VALID_STATUSES = new Set(["pass", "fail", "timeout", "skipped", "not_run"]);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return { __parse_error: error instanceof Error ? error.message : "parse_failed" };
  }
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function listProofFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "proof-summary.json" && entry.name !== "final-report.json")
    .map((entry) => path.join(dir, entry.name));
}

function verifyArtifact(filePath, proofDir) {
  const errors = [];
  const artifact = readJson(filePath);
  if (artifact.__parse_error) {
    return [`${filePath}: invalid JSON: ${artifact.__parse_error}`];
  }
  for (const field of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(artifact, field)) {
      errors.push(`${filePath}: missing required field ${field}`);
    }
  }
  if (artifact.artifact_version !== "1.0") {
    errors.push(`${filePath}: artifact_version must be 1.0`);
  }
  if (!VALID_STATUSES.has(artifact.status)) {
    errors.push(`${filePath}: invalid status ${artifact.status}`);
  }
  if ((artifact.status === "skipped" || artifact.status === "not_run") && !artifact.notes) {
    errors.push(`${filePath}: ${artifact.status} requires notes`);
  }
  if (typeof artifact.redaction_applied !== "boolean") {
    errors.push(`${filePath}: redaction_applied must be present as boolean`);
  }
  if (!artifact.side_effects) {
    errors.push(`${filePath}: side_effects must be present`);
  }
  for (const field of ["stdout_path", "stderr_path"]) {
    const value = artifact[field];
    if (!value) continue;
    if (!fs.existsSync(value)) {
      errors.push(`${filePath}: referenced ${field} does not exist: ${value}`);
    }
    if (!isInside(proofDir, value)) {
      errors.push(`${filePath}: referenced ${field} is outside proof directory: ${value}`);
    }
  }
  if (Array.isArray(artifact.screenshots)) {
    for (const screenshot of artifact.screenshots) {
      if (!fs.existsSync(screenshot)) {
        errors.push(`${filePath}: referenced screenshot does not exist: ${screenshot}`);
      }
      if (!isInside(proofDir, screenshot)) {
        errors.push(`${filePath}: screenshot is outside proof directory: ${screenshot}`);
      }
    }
  } else {
    errors.push(`${filePath}: screenshots must be an array`);
  }
  return errors;
}

const args = parseArgs();
const proofDir = args.proofDir ?? process.env.ENGINEERING_OS_PROOF_DIR ?? defaultProofRoot();
const files = listProofFiles(proofDir);
const errors = [];
const nonPass = [];

if (files.length === 0) {
  errors.push(`${proofDir}: no proof artifacts found`);
}
for (const file of files) {
  const artifact = readJson(file);
  if (artifact && !artifact.__parse_error && artifact.status !== "pass") {
    nonPass.push({
      proof_id: artifact.proof_id,
      script_name: artifact.script_name,
      status: artifact.status,
      notes: artifact.notes,
      artifact_path: file,
    });
  }
  errors.push(...verifyArtifact(file, proofDir));
}

if (errors.length > 0) {
  console.error(JSON.stringify({ status: "fail", proof_directory: proofDir, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "pass",
  proof_directory: proofDir,
  artifact_count: files.length,
  non_pass_statuses: nonPass,
}, null, 2));
