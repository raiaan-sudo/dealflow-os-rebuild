#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "./write-proof-artifact.mjs";

const DEFAULT_ROOTS = [
  "src/app",
  "src/components",
  "package.json",
  "next.config.mjs",
  "middleware.ts",
  "src/proxy.ts",
  ".next/static",
];

const IGNORE_SEGMENTS = new Set([
  "node_modules",
  ".git",
  ".next/cache",
  "data/engineering-proof-artifacts",
  "screenshots",
  "logs",
  "tmp",
  "temp",
]);

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".md",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

const SECRET_MARKERS = [
  ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
  ["SERVICE_ROLE", "SERVICE_ROLE"],
  ["STRIPE_SECRET", "STRIPE_SECRET"],
  ["STRIPE_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET"],
  ["META_ACCESS_TOKEN", "META_ACCESS_TOKEN"],
  ["TWILIO_AUTH_TOKEN", "TWILIO_AUTH_TOKEN"],
  ["FRESHDESK_API_KEY", "FRESHDESK_API_KEY"],
  ["HIGGSFIELD_TOKEN", "HIGGSFIELD_TOKEN"],
  ["HIGGSFIELD_API_KEY", "HIGGSFIELD_API_KEY"],
  ["HIGGSFIELD_SECRET", "HIGGSFIELD_SECRET"],
  ["OPENAI_API_KEY", "OPENAI_API_KEY"],
  ["CRON_SECRET", "CRON_SECRET"],
  ["INTERNAL_SYSTEM_JOBS_SECRET", "INTERNAL_SYSTEM_JOBS_SECRET"],
  ["PRIVATE_KEY", "PRIVATE KEY"],
  ["SIGNED_URL_PARAM", "X-Amz-Signature"],
  ["SIGNED_URL_ACCESS_TOKEN_QUERY_START", "?access_token="],
  ["SIGNED_URL_ACCESS_TOKEN_QUERY_PARAM", "&access_token="],
  ["SIGNED_URL_SIGNATURE", "signature="],
  ["STRIPE_SECRET_VALUE", "sk_live_"],
  ["STRIPE_SECRET_VALUE", "sk_test_"],
];

function shouldIgnore(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  if (normalized.startsWith("src/app/api/")) return true;
  return [...IGNORE_SEGMENTS].some((segment) => normalized.includes(segment));
}

function classify(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  if (normalized.startsWith(".next/static/")) return "build_static";
  if (normalized.startsWith(".next/server/")) return "build_server";
  if (normalized.startsWith("src/app/api/")) return "api_route";
  if (normalized.startsWith("src/app/") || normalized.startsWith("src/components/")) return "client";
  if (normalized.startsWith("scripts/")) return "script";
  if (normalized.startsWith("docs/")) return "docs";
  if (normalized.includes("next.config") || normalized.includes("middleware") || normalized.includes("proxy")) return "config";
  return "source";
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const stat = fs.statSync(root);
  if (stat.isFile()) return [root];
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || shouldIgnore(current)) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const next = path.join(current, entry.name);
      if (shouldIgnore(next)) continue;
      if (entry.isDirectory()) {
        stack.push(next);
      } else if (entry.isFile()) {
        out.push(next);
      }
    }
  }
  return out;
}

function isTextFile(filePath) {
  const ext = path.extname(filePath);
  return TEXT_EXTENSIONS.has(ext);
}

function scanFile(filePath) {
  if (!isTextFile(filePath)) return [];
  const stat = fs.statSync(filePath);
  if (stat.size > 2_000_000) {
    return [{ file: filePath, classification: classify(filePath), labels: ["skipped_large_file"], risk: "review" }];
  }
  const buffer = fs.readFileSync(filePath);
  const labels = SECRET_MARKERS
    .filter(([, marker]) => {
      const exact = Buffer.from(marker);
      if (buffer.includes(exact)) return true;
      const lower = marker.toLowerCase();
      return lower !== marker && buffer.includes(Buffer.from(lower));
    })
    .map(([label]) => label);
  if (labels.length === 0) return [];
  const classification = classify(filePath);
  const risk = classification === "client" || classification === "build_static" ? "fail" : "review";
  return [{ file: filePath, classification, labels, risk }];
}

function scanRoots(roots) {
  const files = [...new Set(roots.flatMap(listFiles))].sort();
  return files.flatMap(scanFile).sort((left, right) => left.file.localeCompare(right.file));
}

function main() {
  const args = parseArgs();
  const configuredRoots = args.roots
    ? String(args.roots).split(",").filter(Boolean)
    : args.includeServerBuild
      ? [...DEFAULT_ROOTS, ".next/server"]
      : args.includeOps
        ? [...DEFAULT_ROOTS, "scripts", "docs"]
        : DEFAULT_ROOTS;
  const roots = configuredRoots.filter((root) => fs.existsSync(root));
  const files = [...new Set(roots.flatMap(listFiles))].sort();
  const findings = scanRoots(roots);
  const failFindings = findings.filter((finding) => finding.risk === "fail");
  const result = {
    status: failFindings.length > 0 ? "fail" : "pass",
    files_scanned: files.length,
    findings_count: findings.length,
    fail_count: failFindings.length,
    findings: findings.map((finding) => ({
      file: finding.file,
      classification: finding.classification,
      labels: finding.labels,
      risk: finding.risk,
    })),
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = failFindings.length > 0 ? 1 : 0;
}

main();
