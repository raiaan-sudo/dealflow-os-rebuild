#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertExactVercelDryRunSourcePortfolio } from "./vercel-dry-run-source-contract.mjs";

const root = mkdtempSync(join(tmpdir(), "dealflow-vercel-dry-contract-"));
const manifestRelativePath = "config/release/deployable-source-manifest.json";

function hash(algorithm, value) {
  return createHash(algorithm).update(value).digest("hex");
}

function record(path) {
  const absolute = join(root, path);
  const contents = readFileSync(absolute);
  const stat = lstatSync(absolute);
  return { path, size: stat.size, mode: stat.mode, sha: hash("sha1", contents) };
}

try {
  mkdirSync(join(root, "config", "release"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), "{\"name\":\"fixture\"}\n");
  writeFileSync(join(root, "src", "app.ts"), "export const app = true;\n");
  writeFileSync(join(root, "extra.ts"), "export const extra = true;\n");
  const manifestEntries = ["package.json", "src/app.ts"].map((path) => {
    const source = record(path);
    return {
      path,
      size: source.size,
      mode: source.mode,
      sha256: hash("sha256", readFileSync(join(root, path))),
    };
  });
  const manifest = {
    schemaVersion: "dealflow.deployable-source-manifest.v1",
    entryCount: manifestEntries.length,
    entries: manifestEntries,
  };
  writeFileSync(
    join(root, manifestRelativePath),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const exactFiles = [
    { path: "src", size: 0, mode: 0o040755 },
    record(manifestRelativePath),
    ...manifestEntries.map((entry) => record(entry.path)),
  ];
  const dryRun = {
    basePath: root,
    fileCount: exactFiles.length,
    files: exactFiles,
  };
  const proof = assertExactVercelDryRunSourcePortfolio({
    dryRun,
    manifest,
    root,
    manifestRelativePath,
  });
  assert.equal(proof.status, "PASS");
  assert.equal(proof.regularFileCount, 3);
  assert.equal(proof.directoryEntryCount, 1);
  assert.equal(proof.manifestDeclaredFileCount, 2);
  assert.match(proof.sourceSetSha256, /^[a-f0-9]{64}$/);

  for (const [mutate, pattern] of [
    [
      (files) => files.filter((entry) => entry.path !== "src/app.ts"),
      /path set is not exact/,
    ],
    [
      (files) => [...files, record("extra.ts")],
      /path set is not exact/,
    ],
    [
      (files) => files.map((entry) =>
        entry.path === "src/app.ts" ? { ...entry, sha: "b".repeat(40) } : entry),
      /does not match local source/,
    ],
    [
      (files) => files.map((entry) =>
        entry.path === "src/app.ts" ? { ...entry, mode: 0o100755 } : entry),
      /does not match local source/,
    ],
    [
      (files) => [...files, {
        path: "linked-source",
        size: 0,
        mode: 0o120777,
        sha: "c".repeat(40),
      }],
      /contains a symlink/,
    ],
  ]) {
    const files = mutate(exactFiles.map((entry) => ({ ...entry })));
    assert.throws(
      () => assertExactVercelDryRunSourcePortfolio({
        dryRun: { ...dryRun, fileCount: files.length, files },
        manifest,
        root,
        manifestRelativePath,
      }),
      pattern,
    );
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(
  "Vercel dry-run source contract: PASS (exact path/hash/mode portfolio, manifest-self accounting, directory accounting, and missing/extra/tamper/mode/symlink rejection)",
);
