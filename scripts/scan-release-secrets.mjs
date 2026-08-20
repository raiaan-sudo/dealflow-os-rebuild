#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readSecureFileSnapshot } from "./lib/secure-file-snapshot.mjs";

const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const rules = [
  ["private_key_pem", /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g],
  ["openai_or_stripe_secret", /\b(?:sk|rk)[_-](?:live|test|proj)[_-][A-Za-z0-9_-]{24,}\b/g],
  ["supabase_secret", /\b(?:sb_secret_|sbp_)[A-Za-z0-9_-]{24,}\b/g],
  ["github_token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g],
  ["slack_token", /\bxox[baprs]-[A-Za-z0-9-]{24,}\b/g],
  ["meta_access_token", /\bEAA[A-Za-z0-9_-]{32,}\b/g],
  ["credentialed_database_url", /\bpostgres(?:ql)?:\/\/[^\s:/]+:[^\s@/]+@[^\s"']+/gi],
];

const filesResult = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
  encoding: "buffer",
  maxBuffer: 32 * 1024 * 1024,
});
if (filesResult.error || filesResult.status !== 0) {
  throw new Error("Unable to enumerate the release worktree for secret scanning");
}

const paths = [...new Set(filesResult.stdout.toString("utf8").split("\0").filter(Boolean))].sort();
const findings = [];
let scannedFileCount = 0;

for (const path of paths) {
  if (path === "supabase/.temp" || path.startsWith("supabase/.temp/")) {
    findings.push({ path, rule: "tracked_or_unignored_supabase_cli_state" });
  }
}

for (const path of paths) {
  let buffer;
  try {
    buffer = readSecureFileSnapshot(path, { maxBytes: MAX_TEXT_BYTES }).contents;
  } catch (error) {
    if (
      error?.code === "ENOENT" ||
      error?.code === "ELOOP" ||
      error?.message === "secure_file_snapshot_not_regular" ||
      error?.message === "secure_file_snapshot_too_large"
    ) continue;
    throw error;
  }
  if (buffer.includes(0)) continue;
  const source = buffer.toString("utf8");
  scannedFileCount += 1;
  for (const [rule, pattern] of rules) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const index = match.index ?? 0;
      const context = source.slice(Math.max(0, index - 100), index + match[0].length + 100);
      const isDeclaredTestFixture =
        /(?:^|\/)test[^/]*\.(?:mjs|ts|tsx|js)$/.test(path) &&
        /sentinel|fixture|example|test-only|localhost|127\.0\.0\.1|password/i.test(context);
      if (!isDeclaredTestFixture) findings.push({ path, rule });
    }
  }
}

if (findings.length > 0) {
  const safeLocations = findings.map(({ path, rule }) => `${path} [${rule}]`).join("\n");
  throw new Error(`Probable release secrets detected (values suppressed):\n${safeLocations}`);
}

console.log(
  `release secret scan: PASS (${scannedFileCount} text files, ${rules.length} high-confidence credential classes, values never emitted)`,
);
