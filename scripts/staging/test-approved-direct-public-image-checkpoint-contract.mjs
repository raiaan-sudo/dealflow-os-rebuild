#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readSecureFileSnapshot } from "../lib/secure-file-snapshot.mjs";

import {
  APPROVED_DIRECT_PUBLIC_IMAGE_GATE_PREDICATES,
  APPROVED_DIRECT_PUBLIC_IMAGE_MATRIX_MODES,
  APPROVED_DIRECT_PUBLIC_IMAGE_SOURCE_PREDICATES,
  assertExactApprovedDirectPublicImageMatrixCheckpoint,
  buildApprovedDirectPublicImageMatrixCheckpoint,
  evaluateApprovedDirectPublicImageSixModeMatrix,
  sanitizeApprovedDirectPublicImageEdgeCache,
  writeAtomicApprovedDirectPublicImageMatrixCheckpoint,
} from "./approved-direct-public-image-checkpoint-contract.mjs";

const EXPECTED_ASSET_HASH =
  "86ec6b7627602d55faf7bf792d30d07479814ec6debb4879816f9520d89263bf";
const OBSERVED_MUTATION_HASH = "b".repeat(64);
const GATE_HASH =
  "58e46b31fc6d69e3ecdb843eeff8bac8d49c9a70cdac583c73986a8a4fb5d1b0";
const EXPECTED_MODE_PREDICATE_NEGATIVE_COUNT = 42;
const asset = Object.freeze({
  bodyBytes: 1150,
  bodySha256: EXPECTED_ASSET_HASH,
  contentType: "image/vnd.microsoft.icon",
});
const gateContract = Object.freeze({
  status: 404,
  contentType: "application/json",
  bodyBytes: 22,
  bodySha256: GATE_HASH,
});

const gateResponse = () => ({
  status: 404,
  contentType: "application/json",
  bodyBytes: 22,
  bodySha256: GATE_HASH,
  cacheControl: "private, no-store",
  robotsTag: "noindex, nofollow",
  vercelErrorPresent: false,
  redirectFollowed: false,
  responseUrlExact: true,
  xVercelCache: "MISS",
  ageSeconds: 0,
});

const sourceResponse = () => ({
  status: 200,
  contentType: "image/vnd.microsoft.icon",
  bodyBytes: 1150,
  bodySha256: EXPECTED_ASSET_HASH,
  cacheControl: "public, max-age=0, must-revalidate",
  robotsTag: "",
  vercelErrorPresent: false,
  redirectFollowed: false,
  responseUrlExact: true,
  xVercelCache: "HIT",
  ageSeconds: 17,
});

function exactMatrix() {
  return {
    noGateBeforeWarm: gateResponse(),
    headerGate: sourceResponse(),
    cookieGate: sourceResponse(),
    noGateAfterWarm: gateResponse(),
    invalidHeaderAfterWarm: gateResponse(),
    invalidCookieAfterWarm: gateResponse(),
  };
}

function evaluate(matrix, assetOrdinal = 1) {
  return evaluateApprovedDirectPublicImageSixModeMatrix({
    assetOrdinal,
    asset,
    matrix,
    gateContract,
  });
}

const passEvaluation = evaluate(exactMatrix());
assert.equal(passEvaluation.matrixStatus, "PASS");
assert.deepEqual(passEvaluation.failures, []);
assert.deepEqual(Object.keys(passEvaluation.modes), [
  ...APPROVED_DIRECT_PUBLIC_IMAGE_MATRIX_MODES,
]);
let modePredicateNegativeCount = 0;
for (const mode of APPROVED_DIRECT_PUBLIC_IMAGE_MATRIX_MODES) {
  const sourceMode = ["headerGate", "cookieGate"].includes(mode);
  assert.deepEqual(
    Object.keys(passEvaluation.modes[mode].predicates),
    sourceMode
      ? [...APPROVED_DIRECT_PUBLIC_IMAGE_SOURCE_PREDICATES]
      : [...APPROVED_DIRECT_PUBLIC_IMAGE_GATE_PREDICATES],
  );
  assert.ok(
    Object.values(passEvaluation.modes[mode].predicates).every(Boolean),
    `${mode} should pass every predicate`,
  );
  assert.deepEqual(passEvaluation.modes[mode].failedPredicates, []);
}

const predicateMutations = Object.freeze({
  statusExact(result) {
    result.status = 418;
  },
  contentTypeExact(result) {
    result.contentType = "text/plain";
  },
  bodyBytesExact(result) {
    result.bodyBytes += 1;
  },
  bodySha256Exact(result) {
    result.bodySha256 = OBSERVED_MUTATION_HASH;
  },
  cacheControlNoStore(result) {
    result.cacheControl = "public, max-age=300";
  },
  robotsNoIndex(result) {
    result.robotsTag = "index, follow";
  },
  vercelErrorAbsent(result) {
    result.vercelErrorPresent = true;
  },
  redirectNotFollowed(result) {
    result.redirectFollowed = true;
  },
  responseUrlExact(result) {
    result.responseUrlExact = false;
  },
});

for (const mode of APPROVED_DIRECT_PUBLIC_IMAGE_MATRIX_MODES) {
  const sourceMode = ["headerGate", "cookieGate"].includes(mode);
  const predicates = sourceMode
    ? APPROVED_DIRECT_PUBLIC_IMAGE_SOURCE_PREDICATES
    : APPROVED_DIRECT_PUBLIC_IMAGE_GATE_PREDICATES;
  for (const predicate of predicates) {
    modePredicateNegativeCount += 1;
    const matrix = exactMatrix();
    predicateMutations[predicate](matrix[mode]);
    const failure = evaluate(matrix);
    assert.equal(failure.matrixStatus, "FAIL", `${mode}.${predicate}`);
    assert.deepEqual(failure.failures, [
      {
        assetOrdinal: 1,
        assetIdentity: EXPECTED_ASSET_HASH,
        mode,
        failedPredicates: [predicate],
      },
    ]);
    assert.deepEqual(failure.modes[mode].failedPredicates, [predicate]);
    const serialized = JSON.stringify(failure);
    assert.ok(!serialized.includes("private, no-store"));
    assert.ok(!serialized.includes("noindex, nofollow"));
    assert.ok(!serialized.includes(OBSERVED_MUTATION_HASH));
  }
}
assert.equal(
  modePredicateNegativeCount,
  EXPECTED_MODE_PREDICATE_NEGATIVE_COUNT,
);

assert.deepEqual(
  sanitizeApprovedDirectPublicImageEdgeCache({
    xVercelCache: " stale ",
    age: "123",
  }),
  { xVercelCache: "STALE", ageSeconds: 123 },
);
assert.deepEqual(
  sanitizeApprovedDirectPublicImageEdgeCache({
    xVercelCache: "Bearer should-never-persist",
    age: "not-a-number-should-never-persist",
  }),
  { xVercelCache: null, ageSeconds: null },
);
const unsafeObservedContentTypeMatrix = exactMatrix();
unsafeObservedContentTypeMatrix.noGateBeforeWarm.contentType =
  "token/should-never-persist";
const unsafeObservedContentTypeEvaluation = evaluate(
  unsafeObservedContentTypeMatrix,
);
assert.equal(
  unsafeObservedContentTypeEvaluation.modes.noGateBeforeWarm.response.contentType,
  null,
);
assert.ok(
  !JSON.stringify(unsafeObservedContentTypeEvaluation).includes(
    "should-never-persist",
  ),
);
for (const allowed of [
  "BYPASS",
  "HIT",
  "MISS",
  "PRERENDER",
  "REVALIDATED",
  "STALE",
]) {
  assert.equal(
    sanitizeApprovedDirectPublicImageEdgeCache({ xVercelCache: allowed }).xVercelCache,
    allowed,
  );
}
for (const unsafeAge of [-1, Number.MAX_SAFE_INTEGER + 1, "-1", "1.5", "1e3", ""]) {
  assert.equal(
    sanitizeApprovedDirectPublicImageEdgeCache({ age: unsafeAge }).ageSeconds,
    null,
  );
}

const inProgress = buildApprovedDirectPublicImageMatrixCheckpoint({
  aliasOrdinal: 1,
  aliasLabel: "stable_direct",
  totalAssetCount: 2,
  evaluations: [passEvaluation],
});
assert.equal(inProgress.status, "IN_PROGRESS");
assert.equal(inProgress.evaluatedAssetCount, 1);
assert.equal(inProgress.completedAssetCount, 1);
assert.equal(inProgress.firstFailure, null);
assertExactApprovedDirectPublicImageMatrixCheckpoint(inProgress);

const failedSecondMatrix = exactMatrix();
predicateMutations.contentTypeExact(failedSecondMatrix.cookieGate);
const failedSecondEvaluation = evaluate(failedSecondMatrix, 2);
const failedCheckpoint = buildApprovedDirectPublicImageMatrixCheckpoint({
  aliasOrdinal: 1,
  aliasLabel: "stable_direct",
  totalAssetCount: 2,
  evaluations: [passEvaluation, failedSecondEvaluation],
});
assert.equal(failedCheckpoint.status, "FAILED");
assert.deepEqual(failedCheckpoint.firstFailure, {
  assetOrdinal: 2,
  assetIdentity: EXPECTED_ASSET_HASH,
  mode: "cookieGate",
  failedPredicates: ["contentTypeExact"],
});
assert.equal(failedCheckpoint.rawBodyPersisted, false);
assert.equal(failedCheckpoint.observedBodySha256Persisted, false);
assert.equal(failedCheckpoint.rawHeadersPersisted, false);
assert.equal(failedCheckpoint.requestIdentifiersPersisted, false);
assert.equal(failedCheckpoint.authenticationMaterialPersisted, false);
assert.equal(failedCheckpoint.containsSecrets, false);
assertExactApprovedDirectPublicImageMatrixCheckpoint(failedCheckpoint);

const checkpointText = JSON.stringify(failedCheckpoint);
for (const forbidden of [
  "private, no-store",
  "noindex, nofollow",
  "Bearer should-never-persist",
  "not-a-number-should-never-persist",
  OBSERVED_MUTATION_HASH,
]) {
  assert.ok(!checkpointText.toLowerCase().includes(forbidden.toLowerCase()));
}

const root = mkdtempSync(join(tmpdir(), "dealflow-public-image-checkpoint-"));
try {
  const checkpointPath = join(
    root,
    "approved-direct-public-image-matrix-checkpoint-01.json",
  );
  writeAtomicApprovedDirectPublicImageMatrixCheckpoint(
    checkpointPath,
    inProgress,
  );
  assert.deepEqual(JSON.parse(readFileSync(checkpointPath, "utf8")), inProgress);
  assert.equal(lstatSync(checkpointPath).mode & 0o777, 0o600);
  assert.equal(existsSync(`${checkpointPath}.tmp`), false);

  writeAtomicApprovedDirectPublicImageMatrixCheckpoint(
    checkpointPath,
    failedCheckpoint,
  );
  const retainedFailureBytes = readSecureFileSnapshot(checkpointPath).contents;
  assert.deepEqual(JSON.parse(retainedFailureBytes), failedCheckpoint);
  assert.equal(existsSync(`${checkpointPath}.tmp`), false);

  const firstDigest = createHash("sha256")
    .update(retainedFailureBytes)
    .digest("hex");
  writeAtomicApprovedDirectPublicImageMatrixCheckpoint(
    checkpointPath,
    failedCheckpoint,
  );
  const secondDigest = createHash("sha256")
    .update(readSecureFileSnapshot(checkpointPath).contents)
    .digest("hex");
  assert.equal(secondDigest, firstDigest);
  assert.equal(existsSync(`${checkpointPath}.tmp`), false);
} finally {
  rmSync(root, { recursive: true, force: true });
}

const completeSecondEvaluation = evaluate(exactMatrix(), 2);
const completeCheckpoint = buildApprovedDirectPublicImageMatrixCheckpoint({
  aliasOrdinal: 1,
  aliasLabel: "stable_direct",
  totalAssetCount: 2,
  evaluations: [passEvaluation, completeSecondEvaluation],
});
assert.equal(completeCheckpoint.status, "PASS");
assert.equal(completeCheckpoint.completedAssetCount, 2);
assert.equal(
  JSON.stringify(completeCheckpoint),
  JSON.stringify(
    buildApprovedDirectPublicImageMatrixCheckpoint({
      aliasOrdinal: 1,
      aliasLabel: "stable_direct",
      totalAssetCount: 2,
      evaluations: [passEvaluation, completeSecondEvaluation],
    }),
  ),
);

assert.throws(
  () =>
    assertExactApprovedDirectPublicImageMatrixCheckpoint({
      ...completeCheckpoint,
      unexpectedSecretField: "must-be-rejected",
    }),
  /keys were not exact/,
);
assert.throws(
  () => evaluateApprovedDirectPublicImageSixModeMatrix({
    assetOrdinal: 1,
    asset,
    gateContract,
    matrix: { ...exactMatrix(), seventhMode: gateResponse() },
  }),
  /keys were not exact/,
);

console.log(
  `approved direct public image checkpoint contract passed (${APPROVED_DIRECT_PUBLIC_IMAGE_MATRIX_MODES.length} modes; ${EXPECTED_MODE_PREDICATE_NEGATIVE_COUNT} exhaustive mode/predicate negatives)`,
);
