#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { defaultProofRoot, parseArgs } from "./write-proof-artifact.mjs";

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function listProofFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "proof-summary.json" && entry.name !== "final-report.json")
    .map((entry) => path.join(dir, entry.name));
}

function latestMission(artifacts) {
  const byMission = new Map();
  for (const artifact of artifacts) {
    const current = byMission.get(artifact.mission_id);
    if (!current || artifact.created_at > current.created_at) {
      byMission.set(artifact.mission_id, artifact);
    }
  }
  return [...byMission.values()].sort((left, right) => right.created_at.localeCompare(left.created_at))[0]?.mission_id ?? null;
}

function summarize(dir) {
  const files = listProofFiles(dir);
  const artifacts = files.map(readJson).filter(Boolean);
  const missionId = latestMission(artifacts);
  const missionArtifacts = missionId ? artifacts.filter((artifact) => artifact.mission_id === missionId) : artifacts;
  const statuses = missionArtifacts.reduce((acc, artifact) => {
    acc[artifact.status] = (acc[artifact.status] ?? 0) + 1;
    return acc;
  }, {});
  const nonPass = missionArtifacts.filter((artifact) => artifact.status !== "pass");
  const durations = missionArtifacts.map((artifact) => Number(artifact.duration_ms ?? 0));
  const summary = {
    proof_directory: dir,
    latest_mission_id: missionId,
    artifact_count: missionArtifacts.length,
    statuses,
    failed_timeout_skipped_not_run: nonPass.map((artifact) => ({
      proof_id: artifact.proof_id,
      script_name: artifact.script_name,
      status: artifact.status,
      notes: artifact.notes,
      artifact_path: files.find((file) => readJson(file)?.proof_id === artifact.proof_id) ?? null,
    })),
    proof_artifact_paths: files,
    duration_ms: durations.reduce((sum, value) => sum + value, 0),
    environment: missionArtifacts[0]?.environment ?? null,
    commit_sha: missionArtifacts[0]?.commit_sha ?? null,
    branch: missionArtifacts[0]?.branch ?? null,
    required_artifacts_complete: missionArtifacts.length > 0 && nonPass.length === 0,
    redaction_applied: missionArtifacts.every((artifact) => artifact.redaction_applied === true),
    side_effects: missionArtifacts.some((artifact) => artifact.side_effects !== "none") ? "documented" : "none",
  };
  const summaryPath = path.join(dir, "proof-summary.json");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return { summary, summaryPath };
}

const args = parseArgs();
const proofDir = args.proofDir ?? process.env.ENGINEERING_OS_PROOF_DIR ?? defaultProofRoot();
const { summary, summaryPath } = summarize(proofDir);
console.log(JSON.stringify({ ...summary, summary_path: summaryPath }, null, 2));
