import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = process.cwd();
const allowedFiles = new Set([
  "src/lib/services/campaign-plan-persistence-service.ts",
]);

function runRg() {
  try {
    const output = execFileSync(
      "rg",
      [
        "-n",
        String.raw`from\("campaign_plans"\)[\s\S]{0,240}?update\([\s\S]{0,120}?plan:`,
        join(repoRoot, "src"),
        "-U",
      ],
      { encoding: "utf8" },
    );

    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 1) {
      return [];
    }

    throw error;
  }
}

function main() {
  const matches = runRg();
  const offenders = [];

  for (const line of matches) {
    const firstColon = line.indexOf(":");
    const secondColon = line.indexOf(":", firstColon + 1);
    const absolutePath = line.slice(0, firstColon);
    const relativePath = absolutePath.replace(`${repoRoot}/`, "");
    const lineNumber = Number(line.slice(firstColon + 1, secondColon));

    if (allowedFiles.has(relativePath)) {
      continue;
    }

    offenders.push({ relativePath, lineNumber });
  }

  assert.equal(
    offenders.length,
    0,
    `Direct campaign_plans.plan writes found outside campaign-plan-persistence-service.ts:\n${offenders
      .map((item) => `- ${item.relativePath}:${item.lineNumber}`)
      .join("\n")}`,
  );

  const persistenceFile = readFileSync(
    join(repoRoot, "src/lib/services/campaign-plan-persistence-service.ts"),
    "utf8",
  );

  assert.match(
    persistenceFile,
    /all campaign plan mutations must flow through this helper/,
    "Persistence helper contract comment is missing.",
  );

  console.log("campaign plan write path check passed");
}

main();
