#!/usr/bin/env node

import assert from "node:assert/strict";

import { assertExactDeployableSourcePathSet } from "./deployable-source-path-set-contract.mjs";

const expectedTrackedPaths = ["package.json", "src/app.ts", "src/lib.ts"];
assert.deepEqual(
  assertExactDeployableSourcePathSet({
    manifestPaths: [...expectedTrackedPaths],
    expectedTrackedPaths,
  }),
  { status: "PASS", exactPathSet: true, pathCount: 3 },
);

for (const manifestPaths of [
  ["package.json", "src/app.ts"],
  ["package.json", "src/app.ts", "src/extra.ts", "src/lib.ts"],
  ["src/app.ts", "package.json", "src/lib.ts"],
  ["package.json", "src/app.ts", "src/app.ts"],
  ["package.json", "../outside", "src/lib.ts"],
]) {
  assert.throws(
    () => assertExactDeployableSourcePathSet({
      manifestPaths,
      expectedTrackedPaths,
    }),
    /path set is not exact|sorted unique relative paths/,
  );
}

console.log(
  "deployable source path-set contract: PASS (exact equality plus omitted, extra, reordered, duplicate, and traversal rejection)",
);
