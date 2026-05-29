import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = process.cwd();
const allowedFiles = new Set([
  "src/lib/services/campaign-plan-persistence-service.ts",
]);
const sourceRoot = join(repoRoot, "src");
const searchableExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const rgCandidates = [
  process.env.RG_PATH,
  "/Users/raiaanreza/Desktop/Codex.app/Contents/Resources/rg",
  "/opt/homebrew/bin/rg",
  "/usr/local/bin/rg",
  "rg",
].filter(Boolean);

function resolveRg() {
  for (const candidate of rgCandidates) {
    try {
      execFileSync(candidate, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5_000 });
      return candidate;
    } catch {
      // Try the next known location.
    }
  }

  return null;
}

function isSearchableFile(filePath) {
  return [...searchableExtensions].some((extension) => filePath.endsWith(extension));
}

function listSourceFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const currentStat = statSync(current);

    if (currentStat.isFile()) {
      if (isSearchableFile(current)) files.push(current);
      continue;
    }

    if (!currentStat.isDirectory()) continue;

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      stack.push(join(current, entry.name));
    }
  }

  return files.sort();
}

function lineNumberForIndex(content, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function findPlanWrites() {
  const rg = resolveRg();
  if (rg) {
    try {
      const output = execFileSync(
        rg,
        [
          "-n",
          String.raw`from\("campaign_plans"\)[\s\S]{0,240}?update\([\s\S]{0,120}?plan:`,
          sourceRoot,
          "-U",
        ],
        { encoding: "utf8", timeout: 20_000 },
      );

      return output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const firstColon = line.indexOf(":");
          const secondColon = line.indexOf(":", firstColon + 1);
          const absolutePath = line.slice(0, firstColon);
          return {
            absolutePath,
            relativePath: absolutePath.replace(`${repoRoot}/`, ""),
            lineNumber: Number(line.slice(firstColon + 1, secondColon)),
          };
        });
    } catch (error) {
      if (error && typeof error === "object" && "status" in error && error.status === 1) {
        return [];
      }

      throw error;
    }
  }

  const pattern = /from\("campaign_plans"\)[\s\S]{0,240}?update\([\s\S]{0,120}?plan:/g;
  const matches = [];

  for (const file of listSourceFiles(sourceRoot)) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(pattern)) {
      matches.push({
        absolutePath: file,
        relativePath: file.replace(`${repoRoot}/`, ""),
        lineNumber: lineNumberForIndex(content, match.index ?? 0),
      });
    }
  }

  return matches;
}

function main() {
  const matches = findPlanWrites();
  const offenders = [];

  for (const match of matches) {
    if (allowedFiles.has(match.relativePath)) {
      continue;
    }

    offenders.push({ relativePath: match.relativePath, lineNumber: match.lineNumber });
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
