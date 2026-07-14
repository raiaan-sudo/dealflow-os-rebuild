#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  UNSEALED_PLAYWRIGHT_FAILURE_POLICY,
  deleteRegisteredUnsealedPlaywrightArtifactDirectories,
} from "./unsealed-playwright-artifact-cleanup.mjs";

const root = mkdtempSync(join(tmpdir(), "dealflow-playwright-cleanup-contract-"));
const evidenceDir = join(root, "evidence");
const first = join(evidenceDir, "safe-browser-artifacts");
const second = join(evidenceDir, "multi-role-browser-artifacts");
const outside = join(root, "outside-must-survive");
const jwt = `eyJ${"a".repeat(30)}.eyJ${"b".repeat(30)}.${"c".repeat(30)}`;
const cookie = `base64-${"d".repeat(80)}`;

try {
  mkdirSync(first, { recursive: true });
  mkdirSync(second, { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(first, "results.json"), JSON.stringify({ jwt, cookie }));
  writeFileSync(join(first, "results.xml"), `<token>${jwt}</token>`);
  writeFileSync(join(first, "index.html"), `<code>${cookie}</code>`);
  writeFileSync(join(second, "failure.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(outside, "sentinel"), "must survive");

  const disposition = deleteRegisteredUnsealedPlaywrightArtifactDirectories({
    evidenceDir,
    registeredDirectories: [first, second],
  });
  assert.equal(disposition.policy, UNSEALED_PLAYWRIGHT_FAILURE_POLICY);
  assert.equal(disposition.registeredDirectoryCount, 2);
  assert.equal(disposition.deletedDirectoryCount, 2);
  assert.equal(disposition.remainingDirectoryCount, 0);
  assert.equal(disposition.rawReporterArtifactsRetained, false);
  assert.equal(existsSync(first), false);
  assert.equal(existsSync(second), false);
  assert.equal(existsSync(join(outside, "sentinel")), true);
  assert.doesNotMatch(JSON.stringify(disposition), new RegExp(jwt));
  assert.doesNotMatch(JSON.stringify(disposition), new RegExp(cookie));

  const repeated = deleteRegisteredUnsealedPlaywrightArtifactDirectories({
    evidenceDir,
    registeredDirectories: [first, second],
  });
  assert.equal(repeated.deletedDirectoryCount, 0);
  assert.equal(repeated.remainingDirectoryCount, 0);

  mkdirSync(first, { recursive: true });
  writeFileSync(join(first, "secret.json"), JSON.stringify({ jwt }));
  assert.throws(
    () => deleteRegisteredUnsealedPlaywrightArtifactDirectories({
      evidenceDir,
      registeredDirectories: [outside, first],
    }),
    /refused_outside_evidence_path/,
  );
  assert.equal(existsSync(first), false, "valid roots must still be purged after a bad path");
  assert.equal(existsSync(join(outside, "sentinel")), true);
} finally {
  rmSync(root, { recursive: true, force: true });
}

process.stdout.write("PASS unsealed Playwright artifact cleanup contract\n");
