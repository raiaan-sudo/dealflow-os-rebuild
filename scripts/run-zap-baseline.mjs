#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
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

const dockerArgs = [
  "run",
  "--rm",
  "-v",
  `${outDir}:/zap/wrk:rw`,
  "ghcr.io/zaproxy/zaproxy:stable",
  "zap-baseline.py",
  "-t",
  target,
  "-r",
  "zap-report.html",
  "-J",
  "zap-report.json",
  "-w",
  "zap-report.md",
  "-I"
];

const result = spawnSync("docker", dockerArgs, {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(`Could not run Docker/ZAP: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
