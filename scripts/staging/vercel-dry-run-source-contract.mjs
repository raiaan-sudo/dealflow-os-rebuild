import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { readSecureFileSnapshot } from "../lib/secure-file-snapshot.mjs";

import { assertExactDeployableSourcePathSet } from "./deployable-source-path-set-contract.mjs";

const FILE_TYPE_MASK = 0o170000;
const REGULAR_FILE_TYPE = 0o100000;
const DIRECTORY_TYPE = 0o040000;
const SYMBOLIC_LINK_TYPE = 0o120000;

function sha1(value) {
  return createHash("sha1").update(value).digest("hex");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertSafePath(path, label) {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").includes("..")
  ) {
    throw new Error(`${label} contains an unsafe path`);
  }
  return path;
}

function exactLocalFile(root, path) {
  const rootReal = realpathSync(root);
  const absolute = resolve(rootReal, assertSafePath(path, "Vercel dry-run"));
  if (!absolute.startsWith(`${rootReal}${sep}`)) {
    throw new Error("Vercel dry-run source escapes the release root");
  }
  let snapshot;
  try {
    snapshot = readSecureFileSnapshot(absolute);
  } catch {
    throw new Error(`Vercel dry-run source is not a regular file: ${path}`);
  }
  return Object.freeze(snapshot);
}

export function assertExactVercelDryRunSourcePortfolio({
  dryRun,
  manifest,
  root,
  manifestRelativePath,
}) {
  const rootReal = realpathSync(root);
  if (
    !dryRun ||
    typeof dryRun !== "object" ||
    realpathSync(String(dryRun.basePath ?? "")) !== rootReal ||
    !Array.isArray(dryRun.files) ||
    dryRun.files.length === 0 ||
    dryRun.fileCount !== dryRun.files.length ||
    !manifest ||
    typeof manifest !== "object" ||
    !Array.isArray(manifest.entries) ||
    manifest.entryCount !== manifest.entries.length ||
    manifest.entries.some((entry) => entry?.path === manifestRelativePath)
  ) {
    throw new Error("Vercel dry-run source portfolio is malformed");
  }

  const seen = new Set();
  const regular = [];
  let directoryEntryCount = 0;
  for (const raw of dryRun.files) {
    const path = assertSafePath(raw?.path, "Vercel dry-run source portfolio");
    if (seen.has(path)) {
      throw new Error("Vercel dry-run source portfolio contains duplicate paths");
    }
    seen.add(path);
    if (!Number.isSafeInteger(raw?.mode) || raw.mode <= 0) {
      throw new Error("Vercel dry-run source portfolio contains an invalid mode");
    }
    const type = raw.mode & FILE_TYPE_MASK;
    if (type === SYMBOLIC_LINK_TYPE) {
      throw new Error("Vercel dry-run source portfolio contains a symlink");
    }
    if (type === DIRECTORY_TYPE) {
      directoryEntryCount += 1;
      continue;
    }
    if (type !== REGULAR_FILE_TYPE) {
      throw new Error("Vercel dry-run source portfolio contains unsupported content");
    }
    if (
      !Number.isSafeInteger(raw.size) ||
      raw.size < 0 ||
      !/^[a-f0-9]{40}$/.test(raw.sha ?? "")
    ) {
      throw new Error("Vercel dry-run regular-file record is malformed");
    }
    const local = exactLocalFile(rootReal, path);
    if (
      local.stat.mode !== raw.mode ||
      local.stat.size !== raw.size ||
      sha1(local.contents) !== raw.sha
    ) {
      throw new Error(`Vercel dry-run record does not match local source: ${path}`);
    }
    regular.push({ path, size: raw.size, mode: raw.mode, sha: raw.sha });
  }

  regular.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  const expectedPaths = [
    ...manifest.entries.map((entry) => assertSafePath(
      entry?.path,
      "Deployable source manifest",
    )),
    assertSafePath(manifestRelativePath, "Deployable source manifest path"),
  ].sort();
  assertExactDeployableSourcePathSet({
    manifestPaths: regular.map((entry) => entry.path),
    expectedTrackedPaths: expectedPaths,
  });

  for (const entry of manifest.entries) {
    const local = exactLocalFile(rootReal, entry.path);
    if (
      entry.mode !== local.stat.mode ||
      entry.size !== local.stat.size ||
      entry.sha256 !== sha256(local.contents)
    ) {
      throw new Error(
        `Deployable source manifest record does not match local source: ${entry.path}`,
      );
    }
  }

  const digest = createHash("sha256");
  for (const entry of regular) {
    digest.update(
      `${entry.path.length}\0${entry.path}\0${entry.mode}\0${entry.size}\0${entry.sha}\0`,
    );
  }
  return Object.freeze({
    status: "PASS",
    cliFileCount: dryRun.fileCount,
    regularFileCount: regular.length,
    directoryEntryCount,
    manifestDeclaredFileCount: manifest.entryCount,
    manifestSelfIncluded: true,
    exactPathSet: true,
    zeroSymlinks: true,
    sourceSetSha256: digest.digest("hex"),
  });
}
