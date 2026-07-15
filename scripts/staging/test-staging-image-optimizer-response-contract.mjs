#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  LOCAL_NEXT_IMAGE_DISALLOWED_BODY_SHA256,
  NEXT_IMAGE_OPTIMIZER_REJECTION_CACHE_CONTROL,
  VERCEL_IMAGE_OPTIMIZER_ERROR_CODE,
  VERCEL_IMAGE_OPTIMIZER_ERROR_CODE_SHA256,
  VERCEL_IMAGE_OPTIMIZER_NORMALIZED_TEMPLATE_SHA256,
  assertExactNextImageOptimizerSixModeMatrix,
  classifyExactNextImageOptimizerRejection,
} from "./staging-image-optimizer-response-contract.mjs";

const REQUEST_ID_ONE = "iad1::AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const REQUEST_ID_TWO = "sfo1::0123456789abcdefghijklmnopqrstuv";

function edgeBody(requestId = REQUEST_ID_ONE) {
  return Buffer.from(
    `Bad request\n\n${VERCEL_IMAGE_OPTIMIZER_ERROR_CODE}\n\n${requestId}\n`,
    "utf8",
  );
}

function edgeFixture(overrides = {}) {
  return {
    status: 400,
    contentType: "text/plain",
    body: edgeBody(),
    cacheControl: NEXT_IMAGE_OPTIMIZER_REJECTION_CACHE_CONTROL,
    vercelError: VERCEL_IMAGE_OPTIMIZER_ERROR_CODE,
    redirectFollowed: false,
    responseUrlExact: true,
    locationPresent: false,
    ...overrides,
  };
}

function classify(overrides = {}) {
  return classifyExactNextImageOptimizerRejection(edgeFixture(overrides));
}

const exactEdge = classify();
assert.equal(exactEdge.accepted, true);
assert.equal(exactEdge.disposition, "EXACT_VERCEL_EDGE_IMAGE_OPTIMIZER_REJECTION");
assert.equal(exactEdge.bodyBytes, 84);
assert.equal(exactEdge.vercelErrorCodeSha256, VERCEL_IMAGE_OPTIMIZER_ERROR_CODE_SHA256);
assert.equal(exactEdge.normalizedTemplateSha256, VERCEL_IMAGE_OPTIMIZER_NORMALIZED_TEMPLATE_SHA256);
assert.equal(exactEdge.requestIdFormatExact, true);
assert.equal(exactEdge.requestIdRegionLength, 4);
assert.equal(exactEdge.requestIdOpaqueLength, 32);
assert.equal(exactEdge.requestIdOpaqueAlphabetExact, true);
assert.equal(exactEdge.rawBodyPersisted, false);
assert.equal(exactEdge.rawBodySha256Persisted, false);
assert.equal(exactEdge.rawRequestIdPersisted, false);
assert.equal(exactEdge.rawVercelErrorPersisted, false);
assert.equal(exactEdge.optimizedImageReturned, false);
assert.equal(exactEdge.nonDataProviderRejection, true);

const secondDynamicEdge = classify({ body: edgeBody(REQUEST_ID_TWO) });
assert.equal(secondDynamicEdge.accepted, true);
assert.equal(
  secondDynamicEdge.normalizedTemplateSha256,
  exactEdge.normalizedTemplateSha256,
  "dynamic request IDs may vary only behind the exact normalized template",
);
assert.ok(!JSON.stringify(exactEdge).includes(REQUEST_ID_ONE));
assert.ok(!JSON.stringify(secondDynamicEdge).includes(REQUEST_ID_TWO));
assert.ok(!Object.hasOwn(exactEdge, "bodySha256"));

const exactLocal = classifyExactNextImageOptimizerRejection({
  ...edgeFixture(),
  body: Buffer.from('"url" parameter is not allowed', "utf8"),
  vercelError: null,
});
assert.equal(exactLocal.accepted, true);
assert.equal(exactLocal.disposition, "EXACT_LOCAL_NEXT_IMAGE_OPTIMIZER_REJECTION");
assert.equal(exactLocal.localFixedBodySha256, LOCAL_NEXT_IMAGE_DISALLOWED_BODY_SHA256);
assert.throws(
  () => assertExactNextImageOptimizerSixModeMatrix({
    noGateBeforeWarm: exactLocal,
    headerGate: exactLocal,
    cookieGate: exactLocal,
    noGateAfterWarm: exactLocal,
    invalidHeaderAfterWarm: exactLocal,
    invalidCookieAfterWarm: exactLocal,
  }),
  /not the exact Vercel edge rejection/,
);

for (const [label, overrides] of [
  ["status", { status: 404 }],
  ["content type", { contentType: "application/json" }],
  ["cache", { cacheControl: "public, max-age=60" }],
  ["redirect", { redirectFollowed: true }],
  ["URL", { responseUrlExact: false }],
  ["location", { locationPresent: true }],
  ["error header", { vercelError: "INVALID_IMAGE_REQUEST" }],
  ["missing error header", { vercelError: null }],
  ["generic 400", { body: Buffer.from("Bad request", "utf8") }],
  ["wrong body template", { body: Buffer.from(`Bad Request\n\n${VERCEL_IMAGE_OPTIMIZER_ERROR_CODE}\n\n${REQUEST_ID_ONE}\n`) }],
  ["wrong body code", { body: Buffer.from(`Bad request\n\nINVALID_IMAGE_REQUEST\n\n${REQUEST_ID_ONE}\n`) }],
  ["wrong region case", { body: edgeBody("IAD1::AbCdEfGhIjKlMnOpQrStUvWxYz012345") }],
  ["wrong region length", { body: edgeBody("iad10::AbCdEfGhIjKlMnOpQrStUvWxYz012345") }],
  ["short opaque ID", { body: edgeBody("iad1::AbCdEfGhIjKlMnOpQrStUvWxYz01234") }],
  ["long opaque ID", { body: edgeBody("iad1::AbCdEfGhIjKlMnOpQrStUvWxYz0123456") }],
  ["unsafe opaque alphabet", { body: edgeBody("iad1::AbCdEfGhIjKlMnOpQrStUvWxYz01234.") }],
  ["extra trailing byte", { body: Buffer.concat([edgeBody(), Buffer.from("\n")]) }],
  ["non-UTF8 body", { body: Buffer.concat([edgeBody().subarray(0, -1), Buffer.from([0xff])]) }],
]) {
  assert.equal(classify(overrides).accepted, false, `${label} must fail closed`);
}

for (const overrides of [
  { vercelError: VERCEL_IMAGE_OPTIMIZER_ERROR_CODE },
  { body: Buffer.from('"url" parameter is not allowed\n') },
  { body: Buffer.alloc(30, 0x78) },
]) {
  const result = classifyExactNextImageOptimizerRejection({
    ...edgeFixture(),
    body: Buffer.from('"url" parameter is not allowed'),
    vercelError: null,
    ...overrides,
  });
  assert.equal(result.accepted, false, "near-local response must fail closed");
}

const exactEdgeMatrix = Object.freeze({
  noGateBeforeWarm: classify({ body: edgeBody(REQUEST_ID_ONE) }),
  headerGate: classify({ body: edgeBody(REQUEST_ID_TWO) }),
  cookieGate: classify({ body: edgeBody(REQUEST_ID_ONE) }),
  noGateAfterWarm: classify({ body: edgeBody(REQUEST_ID_TWO) }),
  invalidHeaderAfterWarm: classify({ body: edgeBody(REQUEST_ID_ONE) }),
  invalidCookieAfterWarm: classify({ body: edgeBody(REQUEST_ID_TWO) }),
});
assert.equal(
  assertExactNextImageOptimizerSixModeMatrix(exactEdgeMatrix),
  "EXACT_VERCEL_EDGE_IMAGE_OPTIMIZER_REJECTION",
);
assert.throws(
  () => assertExactNextImageOptimizerSixModeMatrix({
    ...exactEdgeMatrix,
    cookieGate: exactLocal,
  }),
  /did not classify identically/,
);
assert.throws(
  () => assertExactNextImageOptimizerSixModeMatrix({
    ...exactEdgeMatrix,
    cookieGate: classify({ status: 500 }),
  }),
  /non-exact rejection/,
);
assert.throws(
  () => assertExactNextImageOptimizerSixModeMatrix({
    ...exactEdgeMatrix,
    cookieGate: {
      ...exactEdgeMatrix.cookieGate,
      rawBodySha256Persisted: true,
    },
  }),
  /closed evidence contract/,
);
const missingMode = { ...exactEdgeMatrix };
delete missingMode.invalidCookieAfterWarm;
assert.throws(
  () => assertExactNextImageOptimizerSixModeMatrix(missingMode),
  /exact six-mode matrix/,
);

console.log(
  "staging image optimizer response contract: PASS (strict Vercel edge normalization, exact local compatibility, sanitized evidence, six-mode identity, and negative surfaces)",
);
