#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const executable = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);
for (const test of [
  "scripts/test-higgsfield-provider.ts",
  "scripts/test-higgsfield-cli.ts",
  "scripts/test-higgsfield-source-proxy.ts",
]) {
  const result = spawnSync(executable, [test], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, "--conditions=react-server"]
        .filter(Boolean)
        .join(" "),
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
