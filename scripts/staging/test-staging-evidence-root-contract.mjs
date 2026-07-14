#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertApprovedStagingEvidenceRootPath } from "./staging-evidence-root-contract.mjs";

const suffix = `${process.pid}-${Date.now()}`;
const approved = `/private/tmp/dealflow-staging-acceptance-evidence-contract-${suffix}`;
assert.equal(assertApprovedStagingEvidenceRootPath(approved), approved);
assert.throws(
  () => assertApprovedStagingEvidenceRootPath("/tmp/dealflow-staging-acceptance-evidence-wrong"),
  /direct child of the real private temp root/,
);
assert.throws(
  () => assertApprovedStagingEvidenceRootPath("/private/tmp/dealflow-staging-acceptance-evidence-"),
  /direct child of the real private temp root/,
);

const scratch = mkdtempSync(join(tmpdir(), "dealflow-evidence-root-contract-"));
const symlinkParent = `/private/tmp/dealflow-staging-acceptance-evidence-link-${suffix}`;
try {
  symlinkSync(scratch, symlinkParent);
  assert.throws(
    () => assertApprovedStagingEvidenceRootPath(
      join(symlinkParent, "dealflow-staging-acceptance-evidence-escaped"),
    ),
    /direct child of the real private temp root/,
  );

  mkdirSync(approved, { mode: 0o700 });
  assert.equal(
    assertApprovedStagingEvidenceRootPath(approved, { mustExist: true }),
    approved,
  );
} finally {
  rmSync(approved, { recursive: true, force: true });
  rmSync(symlinkParent, { force: true });
  rmSync(scratch, { recursive: true, force: true });
}

process.stdout.write("PASS staging evidence root path contract\n");
