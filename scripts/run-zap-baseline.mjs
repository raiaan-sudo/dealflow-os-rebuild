#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const target = process.env.ZAP_TARGET_URL ?? process.env.PRELAUNCH_BASE_URL;

if (!target) {
  console.error("Set ZAP_TARGET_URL or PRELAUNCH_BASE_URL to run the ZAP baseline scan.");
  process.exit(1);
}

if (!/^https?:\/\//.test(target)) {
  console.error("ZAP target must be an http(s) URL.");
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
const outDir = path.join(process.cwd(), "data", "engineering-proof-artifacts", date, "zap-baseline");
fs.mkdirSync(outDir, { recursive: true });

function dockerEnv() {
  const configDir = path.join(outDir, ".docker-config");
  fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, "config.json");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, "{}\n");
  }

  const env = {
    ...process.env,
    DOCKER_CONFIG: process.env.DEALFLOW_ZAP_DOCKER_CONFIG || configDir,
  };

  const colimaSocket = path.join(os.homedir(), ".colima", "default", "docker.sock");
  if (!env.DOCKER_HOST && fs.existsSync(colimaSocket)) {
    env.DOCKER_HOST = `unix://${colimaSocket}`;
  }

  return env;
}

const dockerProcessEnv = dockerEnv();

function dockerCandidates() {
  const candidates = ["docker"];
  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Docker.app/Contents/Resources/bin/docker",
      path.join(os.homedir(), "Applications", "Docker.app", "Contents", "Resources", "bin", "docker"),
    );
  }
  return [...new Set(candidates)];
}

function commandExists(command) {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: dockerProcessEnv,
  });
  return !result.error && result.status === 0;
}

function findDockerCommand() {
  return dockerCandidates().find(commandExists);
}

function assertDockerReady(command) {
  const result = spawnSync(command, ["info", "--format", "{{json .ServerVersion}}"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: dockerProcessEnv,
  });

  if (result.error) {
    return {
      ok: false,
      reason: "DOCKER_CLI_UNAVAILABLE",
      message: result.error.message,
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      reason: "DOCKER_DAEMON_UNAVAILABLE",
      message: (result.stderr || result.stdout || "").trim() || "Docker daemon is not responding.",
    };
  }

  return { ok: true };
}

const dockerCommand = findDockerCommand();

if (!dockerCommand) {
  console.error(
    "ZAP scan blocked: Docker CLI is not available on PATH or in the standard Docker Desktop app locations.",
  );
  process.exit(1);
}

const dockerReady = assertDockerReady(dockerCommand);

if (!dockerReady.ok) {
  console.error(`ZAP scan blocked: ${dockerReady.reason}`);
  if (dockerReady.message) {
    console.error(dockerReady.message);
  }
  process.exit(1);
}

const baselineConfigPath = path.join(process.cwd(), "config", "zap-baseline.conf");
const baselineConfig = fs.existsSync(baselineConfigPath)
  ? fs.readFileSync(baselineConfigPath, "utf8")
  : "";
const baselineConfigTarget = "/zap/wrk/dealflow-zap-baseline.conf";

const dockerArgs = [
  "run",
  "--rm",
  "--user",
  "0:0",
  "-v",
  `${outDir}:/zap/wrk:rw`,
  "ghcr.io/zaproxy/zaproxy:stable",
  "sh",
  "-lc",
  [
    baselineConfig
      ? `printf '%b' ${JSON.stringify(baselineConfig)} > ${baselineConfigTarget}`
      : `rm -f ${baselineConfigTarget}`,
    "cd /zap/wrk",
    [
      "/zap/zap-baseline.py",
      "--autooff",
      "-t",
      JSON.stringify(target),
      "-r",
      "zap-report.html",
      "-J",
      "zap-report.json",
      "-w",
      "zap-report.md",
      baselineConfig ? "-c dealflow-zap-baseline.conf" : "",
      "-I",
    ]
      .filter(Boolean)
      .join(" "),
  ].join(" && "),
];

const result = spawnSync(dockerCommand, dockerArgs, {
  stdio: "inherit",
  env: dockerProcessEnv,
});

if (result.error) {
  console.error(`ZAP scan failed before start: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`ZAP scan completed with non-zero exit code: ${result.status ?? "unknown"}`);
}

process.exit(result.status ?? 1);
