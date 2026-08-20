import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname } from "node:path";

export const APPROVED_DIRECT_PUBLIC_IMAGE_MATRIX_MODES = Object.freeze([
  "noGateBeforeWarm",
  "headerGate",
  "cookieGate",
  "noGateAfterWarm",
  "invalidHeaderAfterWarm",
  "invalidCookieAfterWarm",
]);

export const APPROVED_DIRECT_PUBLIC_IMAGE_GATE_PREDICATES = Object.freeze([
  "statusExact",
  "contentTypeExact",
  "bodyBytesExact",
  "bodySha256Exact",
  "cacheControlNoStore",
  "robotsNoIndex",
  "vercelErrorAbsent",
]);

export const APPROVED_DIRECT_PUBLIC_IMAGE_SOURCE_PREDICATES = Object.freeze([
  "statusExact",
  "contentTypeExact",
  "bodyBytesExact",
  "bodySha256Exact",
  "vercelErrorAbsent",
  "redirectNotFollowed",
  "responseUrlExact",
]);

const SOURCE_MODES = new Set(["headerGate", "cookieGate"]);
const ALLOWED_ALIAS_LABELS = new Set([
  "stable_direct",
  "partner_one",
  "partner_two",
]);
const ALLOWED_VERCEL_CACHE_VALUES = new Set([
  "BYPASS",
  "HIT",
  "MISS",
  "PRERENDER",
  "REVALIDATED",
  "STALE",
]);
const ALLOWED_OBSERVED_CONTENT_TYPES = new Set([
  "application/json",
  "application/octet-stream",
  "image/svg+xml",
  "image/vnd.microsoft.icon",
  "image/x-icon",
  "text/html",
  "text/plain",
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CONTENT_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,127}$/;
const CHECKPOINT_FILE_PATTERN =
  /^approved-direct-public-image-matrix-checkpoint-\d{2}\.json$/;
const SCHEMA_VERSION =
  "dealflow.approved-direct-public-image-matrix-checkpoint.v1";

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new Error(`${label} keys were not exact`);
  }
}

function exactBooleanRecord(value, expectedKeys, label) {
  exactKeys(value, expectedKeys, label);
  for (const key of expectedKeys) {
    if (typeof value[key] !== "boolean") {
      throw new Error(`${label}.${key} must be boolean`);
    }
  }
}

function safeInteger(value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function safeContentType(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return ALLOWED_OBSERVED_CONTENT_TYPES.has(normalized) ? normalized : null;
}

export function sanitizeApprovedDirectPublicImageEdgeCache({
  xVercelCache,
  age,
} = {}) {
  const normalizedCache =
    typeof xVercelCache === "string" ? xVercelCache.trim().toUpperCase() : "";
  const normalizedAge =
    typeof age === "number"
      ? safeInteger(age)
      : typeof age === "string" && /^(?:0|[1-9]\d{0,14})$/.test(age.trim())
        ? safeInteger(Number(age.trim()))
        : null;
  return Object.freeze({
    xVercelCache: ALLOWED_VERCEL_CACHE_VALUES.has(normalizedCache)
      ? normalizedCache
      : null,
    ageSeconds: normalizedAge,
  });
}

function validateAsset(asset) {
  if (
    !asset ||
    typeof asset !== "object" ||
    !SHA256_PATTERN.test(asset.bodySha256 ?? "") ||
    !CONTENT_TYPE_PATTERN.test(asset.contentType ?? "") ||
    !Number.isSafeInteger(asset.bodyBytes) ||
    asset.bodyBytes < 1
  ) {
    throw new Error("Approved direct public image asset identity was invalid");
  }
}

function validateGateContract(gateContract) {
  exactKeys(
    gateContract,
    ["status", "contentType", "bodyBytes", "bodySha256"],
    "approved direct public image gate contract",
  );
  if (
    !Number.isInteger(gateContract.status) ||
    gateContract.status < 100 ||
    gateContract.status > 599 ||
    !CONTENT_TYPE_PATTERN.test(gateContract.contentType ?? "") ||
    !Number.isSafeInteger(gateContract.bodyBytes) ||
    gateContract.bodyBytes < 0 ||
    !SHA256_PATTERN.test(gateContract.bodySha256 ?? "")
  ) {
    throw new Error("Approved direct public image gate contract was invalid");
  }
}

function safeResponse(result) {
  const edgeCache = sanitizeApprovedDirectPublicImageEdgeCache({
    xVercelCache: result?.xVercelCache,
    age: result?.ageSeconds,
  });
  return Object.freeze({
    status: safeInteger(result?.status, { minimum: 100, maximum: 599 }),
    contentType: safeContentType(result?.contentType),
    bodyBytes: safeInteger(result?.bodyBytes),
    xVercelCache: edgeCache.xVercelCache,
    ageSeconds: edgeCache.ageSeconds,
  });
}

function gatePredicates(result, gateContract) {
  return Object.freeze({
    statusExact: result?.status === gateContract.status,
    contentTypeExact: result?.contentType === gateContract.contentType,
    bodyBytesExact: result?.bodyBytes === gateContract.bodyBytes,
    bodySha256Exact: result?.bodySha256 === gateContract.bodySha256,
    cacheControlNoStore:
      typeof result?.cacheControl === "string" &&
      /(?:^|,)\s*(?:private\s*,\s*)?no-store(?:\s|,|$)/i.test(
        result.cacheControl,
      ),
    robotsNoIndex:
      typeof result?.robotsTag === "string" && /noindex/i.test(result.robotsTag),
    vercelErrorAbsent: result?.vercelErrorPresent === false,
  });
}

function sourcePredicates(result, asset) {
  return Object.freeze({
    statusExact: result?.status === 200,
    contentTypeExact: result?.contentType === asset.contentType,
    bodyBytesExact: result?.bodyBytes === asset.bodyBytes,
    bodySha256Exact: result?.bodySha256 === asset.bodySha256,
    vercelErrorAbsent: result?.vercelErrorPresent === false,
    redirectNotFollowed: result?.redirectFollowed === false,
    responseUrlExact: result?.responseUrlExact === true,
  });
}

export function evaluateApprovedDirectPublicImageSixModeMatrix({
  assetOrdinal,
  asset,
  matrix,
  gateContract,
}) {
  if (!Number.isSafeInteger(assetOrdinal) || assetOrdinal < 1) {
    throw new Error("Approved direct public image asset ordinal was invalid");
  }
  validateAsset(asset);
  validateGateContract(gateContract);
  exactKeys(
    matrix,
    APPROVED_DIRECT_PUBLIC_IMAGE_MATRIX_MODES,
    "approved direct public image six-mode matrix",
  );

  const modes = {};
  const failures = [];
  for (const mode of APPROVED_DIRECT_PUBLIC_IMAGE_MATRIX_MODES) {
    const expectation = SOURCE_MODES.has(mode)
      ? "APPROVED_SOURCE_BYTES"
      : "DEALFLOW_APPLICATION_GATE";
    const result = matrix[mode];
    const predicates = SOURCE_MODES.has(mode)
      ? sourcePredicates(result, asset)
      : gatePredicates(result, gateContract);
    const failedPredicates = Object.entries(predicates)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    if (failedPredicates.length > 0) {
      failures.push(Object.freeze({
        assetOrdinal,
        assetIdentity: asset.bodySha256,
        mode,
        failedPredicates: Object.freeze(failedPredicates),
      }));
    }
    modes[mode] = Object.freeze({
      expectation,
      response: safeResponse(result),
      predicates,
      failedPredicates: Object.freeze(failedPredicates),
    });
  }

  return Object.freeze({
    assetOrdinal,
    assetIdentity: asset.bodySha256,
    matrixStatus: failures.length === 0 ? "PASS" : "FAIL",
    modes: Object.freeze(modes),
    failures: Object.freeze(failures),
  });
}

function validateEvaluation(evaluation, expectedOrdinal) {
  exactKeys(
    evaluation,
    ["assetOrdinal", "assetIdentity", "matrixStatus", "modes", "failures"],
    "approved direct public image evaluation",
  );
  if (
    evaluation.assetOrdinal !== expectedOrdinal ||
    !SHA256_PATTERN.test(evaluation.assetIdentity) ||
    !["PASS", "FAIL"].includes(evaluation.matrixStatus)
  ) {
    throw new Error("Approved direct public image evaluation identity was invalid");
  }
  exactKeys(
    evaluation.modes,
    APPROVED_DIRECT_PUBLIC_IMAGE_MATRIX_MODES,
    "approved direct public image evaluation modes",
  );
  const reconstructedFailures = [];
  for (const mode of APPROVED_DIRECT_PUBLIC_IMAGE_MATRIX_MODES) {
    const modeEvidence = evaluation.modes[mode];
    exactKeys(
      modeEvidence,
      ["expectation", "response", "predicates", "failedPredicates"],
      `approved direct public image ${mode} evidence`,
    );
    const sourceMode = SOURCE_MODES.has(mode);
    if (
      modeEvidence.expectation !==
      (sourceMode ? "APPROVED_SOURCE_BYTES" : "DEALFLOW_APPLICATION_GATE")
    ) {
      throw new Error(`Approved direct public image ${mode} expectation was invalid`);
    }
    exactKeys(
      modeEvidence.response,
      [
        "status",
        "contentType",
        "bodyBytes",
        "xVercelCache",
        "ageSeconds",
      ],
      `approved direct public image ${mode} safe response`,
    );
    const response = modeEvidence.response;
    if (
      (response.status !== null &&
        (!Number.isSafeInteger(response.status) || response.status < 100 || response.status > 599)) ||
      (response.contentType !== null &&
        !ALLOWED_OBSERVED_CONTENT_TYPES.has(response.contentType)) ||
      (response.bodyBytes !== null &&
        (!Number.isSafeInteger(response.bodyBytes) || response.bodyBytes < 0)) ||
      (response.xVercelCache !== null &&
        !ALLOWED_VERCEL_CACHE_VALUES.has(response.xVercelCache)) ||
      (response.ageSeconds !== null &&
        (!Number.isSafeInteger(response.ageSeconds) || response.ageSeconds < 0))
    ) {
      throw new Error(`Approved direct public image ${mode} safe response was invalid`);
    }
    const expectedPredicates = sourceMode
      ? APPROVED_DIRECT_PUBLIC_IMAGE_SOURCE_PREDICATES
      : APPROVED_DIRECT_PUBLIC_IMAGE_GATE_PREDICATES;
    exactBooleanRecord(
      modeEvidence.predicates,
      expectedPredicates,
      `approved direct public image ${mode} predicates`,
    );
    const expectedFailed = expectedPredicates.filter(
      (name) => !modeEvidence.predicates[name],
    );
    if (
      !Array.isArray(modeEvidence.failedPredicates) ||
      JSON.stringify(modeEvidence.failedPredicates) !== JSON.stringify(expectedFailed)
    ) {
      throw new Error(`Approved direct public image ${mode} failed predicates were invalid`);
    }
    if (expectedFailed.length > 0) {
      reconstructedFailures.push({
        assetOrdinal: evaluation.assetOrdinal,
        assetIdentity: evaluation.assetIdentity,
        mode,
        failedPredicates: expectedFailed,
      });
    }
  }
  if (JSON.stringify(evaluation.failures) !== JSON.stringify(reconstructedFailures)) {
    throw new Error("Approved direct public image evaluation failures were invalid");
  }
  if (
    evaluation.matrixStatus !==
    (reconstructedFailures.length === 0 ? "PASS" : "FAIL")
  ) {
    throw new Error("Approved direct public image evaluation status was invalid");
  }
}

export function buildApprovedDirectPublicImageMatrixCheckpoint({
  aliasOrdinal,
  aliasLabel,
  totalAssetCount,
  evaluations,
}) {
  if (
    !Number.isSafeInteger(aliasOrdinal) ||
    aliasOrdinal < 1 ||
    !ALLOWED_ALIAS_LABELS.has(aliasLabel) ||
    !Number.isSafeInteger(totalAssetCount) ||
    totalAssetCount < 1 ||
    !Array.isArray(evaluations) ||
    evaluations.length < 1 ||
    evaluations.length > totalAssetCount
  ) {
    throw new Error("Approved direct public image checkpoint identity was invalid");
  }
  evaluations.forEach((evaluation, index) => validateEvaluation(evaluation, index + 1));
  const failures = evaluations.flatMap((evaluation) => evaluation.failures);
  const firstFailure = failures[0] ?? null;
  const status = firstFailure
    ? "FAILED"
    : evaluations.length === totalAssetCount
      ? "PASS"
      : "IN_PROGRESS";
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    status,
    aliasOrdinal,
    aliasLabel,
    evaluatedAssetCount: evaluations.length,
    completedAssetCount: evaluations.filter(
      (evaluation) => evaluation.matrixStatus === "PASS",
    ).length,
    totalAssetCount,
    firstFailure,
    strictResponseRequirementsPreserved: true,
    retryOrRelaxationApplied: false,
    rawBodyPersisted: false,
    observedBodySha256Persisted: false,
    rawHeadersPersisted: false,
    requestIdentifiersPersisted: false,
    authenticationMaterialPersisted: false,
    containsSecrets: false,
    evaluations: Object.freeze([...evaluations]),
  });
}

export function assertExactApprovedDirectPublicImageMatrixCheckpoint(checkpoint) {
  exactKeys(
    checkpoint,
    [
      "schemaVersion",
      "status",
      "aliasOrdinal",
      "aliasLabel",
      "evaluatedAssetCount",
      "completedAssetCount",
      "totalAssetCount",
      "firstFailure",
      "strictResponseRequirementsPreserved",
      "retryOrRelaxationApplied",
      "rawBodyPersisted",
      "observedBodySha256Persisted",
      "rawHeadersPersisted",
      "requestIdentifiersPersisted",
      "authenticationMaterialPersisted",
      "containsSecrets",
      "evaluations",
    ],
    "approved direct public image checkpoint",
  );
  if (
    checkpoint.schemaVersion !== SCHEMA_VERSION ||
    !["IN_PROGRESS", "PASS", "FAILED"].includes(checkpoint.status) ||
    !Number.isSafeInteger(checkpoint.aliasOrdinal) ||
    checkpoint.aliasOrdinal < 1 ||
    !ALLOWED_ALIAS_LABELS.has(checkpoint.aliasLabel) ||
    !Number.isSafeInteger(checkpoint.totalAssetCount) ||
    checkpoint.totalAssetCount < 1 ||
    !Array.isArray(checkpoint.evaluations) ||
    checkpoint.evaluations.length < 1 ||
    checkpoint.evaluations.length > checkpoint.totalAssetCount
  ) {
    throw new Error("Approved direct public image checkpoint was invalid");
  }
  checkpoint.evaluations.forEach((evaluation, index) =>
    validateEvaluation(evaluation, index + 1),
  );
  const rebuilt = buildApprovedDirectPublicImageMatrixCheckpoint({
    aliasOrdinal: checkpoint.aliasOrdinal,
    aliasLabel: checkpoint.aliasLabel,
    totalAssetCount: checkpoint.totalAssetCount,
    evaluations: checkpoint.evaluations,
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(checkpoint)) {
    throw new Error("Approved direct public image checkpoint was not canonical");
  }
  return checkpoint;
}

export function writeAtomicApprovedDirectPublicImageMatrixCheckpoint(
  path,
  checkpoint,
) {
  assertExactApprovedDirectPublicImageMatrixCheckpoint(checkpoint);
  if (
    typeof path !== "string" ||
    !CHECKPOINT_FILE_PATTERN.test(basename(path))
  ) {
    throw new Error("Approved direct public image checkpoint path was invalid");
  }
  const parent = dirname(path);
  const temporaryPath = `${path}.tmp`;
  let descriptor = null;
  let parentDescriptor = null;
  let temporaryCreated = false;
  try {
    if (!Number.isInteger(constants.O_DIRECTORY) || !Number.isInteger(constants.O_NOFOLLOW)) {
      throw new Error("Approved direct public image checkpoint no-follow authority unavailable");
    }
    parentDescriptor = openSync(
      parent,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    if (!fstatSync(parentDescriptor).isDirectory()) {
      throw new Error("Approved direct public image checkpoint parent was unsafe");
    }
    descriptor = openSync(temporaryPath, "wx", 0o600);
    temporaryCreated = true;
    writeFileSync(descriptor, `${JSON.stringify(checkpoint, null, 2)}\n`);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, path);
    temporaryCreated = false;
    chmodSync(path, 0o600);
    fsyncSync(parentDescriptor);
    closeSync(parentDescriptor);
    parentDescriptor = null;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (parentDescriptor !== null) closeSync(parentDescriptor);
    if (temporaryCreated) {
      rmSync(temporaryPath, { force: true });
    }
  }
  return path;
}
