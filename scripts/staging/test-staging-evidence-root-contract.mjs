#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertApprovedStagingEvidenceRootPath } from "./staging-evidence-root-contract.mjs";

const scratch = realpathSync(
  mkdtempSync(join(tmpdir(), "dealflow-evidence-root-contract-")),
);
const approvedParent = join(scratch, "owner-only-parent");
const alternateParent = join(scratch, "alternate-parent");
const symlinkParent = join(scratch, "symlink-parent");
const suffix = `${process.pid}-${Date.now()}`;
const approved = join(
  approvedParent,
  `dealflow-staging-acceptance-evidence-contract-${suffix}`,
);
try {
  mkdirSync(approvedParent, { mode: 0o700 });
  chmodSync(approvedParent, 0o700);
  mkdirSync(alternateParent, { mode: 0o700 });
  chmodSync(alternateParent, 0o700);

  assert.equal(
    assertApprovedStagingEvidenceRootPath(approved, { approvedParent }),
    approved,
  );
  assert.throws(
    () =>
      assertApprovedStagingEvidenceRootPath(
        join(alternateParent, `dealflow-staging-acceptance-evidence-${suffix}`),
        { approvedParent },
      ),
    /direct prefixed child of the approved evidence parent/,
  );
  assert.throws(
    () =>
      assertApprovedStagingEvidenceRootPath(
        join(approvedParent, "dealflow-staging-acceptance-evidence-"),
        { approvedParent },
      ),
    /direct prefixed child of the approved evidence parent/,
  );
  assert.throws(
    () => assertApprovedStagingEvidenceRootPath(approved, {}),
    /Approved evidence parent/,
  );

  symlinkSync(approvedParent, symlinkParent);
  assert.throws(
    () =>
      assertApprovedStagingEvidenceRootPath(
        join(symlinkParent, `dealflow-staging-acceptance-evidence-${suffix}`),
        { approvedParent: symlinkParent },
      ),
    /Approved evidence parent/,
  );

  mkdirSync(approved, { mode: 0o700 });
  assert.equal(
    assertApprovedStagingEvidenceRootPath(approved, {
      approvedParent,
      mustExist: true,
    }),
    approved,
  );
  chmodSync(approved, 0o755);
  assert.throws(
    () =>
      assertApprovedStagingEvidenceRootPath(approved, {
        approvedParent,
        mustExist: true,
      }),
    /owner-only/,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

process.stdout.write("PASS staging evidence root path contract\n");
