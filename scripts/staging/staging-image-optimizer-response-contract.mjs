import { createHash } from "node:crypto";

export const NEXT_IMAGE_OPTIMIZER_REJECTION_CACHE_CONTROL =
  "public, max-age=0, must-revalidate";
export const VERCEL_IMAGE_OPTIMIZER_ERROR_CODE =
  "INVALID_IMAGE_OPTIMIZE_REQUEST";
export const VERCEL_IMAGE_OPTIMIZER_ERROR_CODE_SHA256 =
  "181453757443407acf6ee0919e1a19c891d852a9d505bd40c95c3b9029eee2cf";
export const VERCEL_IMAGE_OPTIMIZER_NORMALIZED_TEMPLATE_SHA256 =
  "77766dbf7dfbed83e26d498b516cde4d31dffb22a1374568bbbb2d9eeb094202";
export const LOCAL_NEXT_IMAGE_DISALLOWED_BODY_SHA256 =
  "3a1ccc2882f115bd4e3e3fa69bdf2614c34865765b5b0db3f78716dfe922de5f";

const LOCAL_NEXT_IMAGE_DISALLOWED_BODY =
  Buffer.from('"url" parameter is not allowed', "utf8");
const VERCEL_IMAGE_OPTIMIZER_BODY_PREFIX =
  `Bad request\n\n${VERCEL_IMAGE_OPTIMIZER_ERROR_CODE}\n\n`;
const VERCEL_IMAGE_OPTIMIZER_NORMALIZED_TEMPLATE =
  `${VERCEL_IMAGE_OPTIMIZER_BODY_PREFIX}[REQUEST_ID]\n`;
const EXACT_VERCEL_REQUEST_ID = /^([a-z]{3}\d)::([A-Za-z0-9_-]{32})$/;
const SIX_MODE_KEYS = Object.freeze([
  "noGateBeforeWarm",
  "headerGate",
  "cookieGate",
  "noGateAfterWarm",
  "invalidHeaderAfterWarm",
  "invalidCookieAfterWarm",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactBodyBuffer(body) {
  if (Buffer.isBuffer(body)) return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  throw new Error("Image optimizer response classification requires exact body bytes");
}

export function classifyExactNextImageOptimizerRejection({
  status,
  contentType,
  body,
  cacheControl,
  vercelError,
  redirectFollowed,
  responseUrlExact,
  locationPresent,
}) {
  const bodyBuffer = exactBodyBuffer(body);
  const bodyText = bodyBuffer.toString("utf8");
  const bodyIsCanonicalUtf8 = Buffer.from(bodyText, "utf8").equals(bodyBuffer);
  const hasExactEnvelope =
    bodyIsCanonicalUtf8 &&
    bodyText.startsWith(VERCEL_IMAGE_OPTIMIZER_BODY_PREFIX) &&
    bodyText.endsWith("\n") &&
    bodyText.split("\n").length === 6;
  const requestId = hasExactEnvelope
    ? bodyText.slice(VERCEL_IMAGE_OPTIMIZER_BODY_PREFIX.length, -1)
    : "";
  const requestIdParts = /^([^:\n]+)::([^\n]+)$/.exec(requestId);
  const exactRequestId = EXACT_VERCEL_REQUEST_ID.exec(requestId);
  const normalizedTemplateSha256 = exactRequestId
    ? sha256(VERCEL_IMAGE_OPTIMIZER_NORMALIZED_TEMPLATE)
    : null;
  const vercelErrorPresent =
    typeof vercelError === "string" && vercelError.length > 0;
  const vercelErrorCodeSha256 = vercelErrorPresent
    ? sha256(vercelError)
    : null;
  const commonSurfaceExact =
    status === 400 &&
    contentType === "text/plain" &&
    cacheControl === NEXT_IMAGE_OPTIMIZER_REJECTION_CACHE_CONTROL &&
    redirectFollowed === false &&
    responseUrlExact === true &&
    locationPresent === false;
  const exactVercelEdgeRejection =
    commonSurfaceExact &&
    bodyBuffer.length === 84 &&
    Boolean(exactRequestId) &&
    normalizedTemplateSha256 ===
      VERCEL_IMAGE_OPTIMIZER_NORMALIZED_TEMPLATE_SHA256 &&
    vercelError === VERCEL_IMAGE_OPTIMIZER_ERROR_CODE &&
    vercelErrorCodeSha256 === VERCEL_IMAGE_OPTIMIZER_ERROR_CODE_SHA256;
  const exactLocalRejection =
    commonSurfaceExact &&
    bodyBuffer.equals(LOCAL_NEXT_IMAGE_DISALLOWED_BODY) &&
    sha256(bodyBuffer) === LOCAL_NEXT_IMAGE_DISALLOWED_BODY_SHA256 &&
    !vercelErrorPresent;
  const disposition = exactVercelEdgeRejection
    ? "EXACT_VERCEL_EDGE_IMAGE_OPTIMIZER_REJECTION"
    : exactLocalRejection
      ? "EXACT_LOCAL_NEXT_IMAGE_OPTIMIZER_REJECTION"
      : "REJECTED_NONEXACT_IMAGE_OPTIMIZER_RESPONSE";

  return Object.freeze({
    schemaVersion: "dealflow.staging-image-optimizer-rejection.v1",
    accepted: exactVercelEdgeRejection || exactLocalRejection,
    disposition,
    status,
    contentType,
    bodyBytes: bodyBuffer.length,
    cacheControl,
    cacheControlExact:
      cacheControl === NEXT_IMAGE_OPTIMIZER_REJECTION_CACHE_CONTROL,
    redirectFollowed,
    responseUrlExact,
    locationPresent,
    vercelErrorPresent,
    vercelErrorCodeExact:
      vercelError === VERCEL_IMAGE_OPTIMIZER_ERROR_CODE,
    vercelErrorCodeSha256,
    vercelErrorCodeSha256Exact:
      vercelErrorCodeSha256 === VERCEL_IMAGE_OPTIMIZER_ERROR_CODE_SHA256,
    bodyEnvelopeExact: hasExactEnvelope,
    normalizedTemplateSha256,
    normalizedTemplateSha256Exact:
      normalizedTemplateSha256 ===
      VERCEL_IMAGE_OPTIMIZER_NORMALIZED_TEMPLATE_SHA256,
    requestIdFormatExact: Boolean(exactRequestId),
    requestIdRegionFormatExact:
      Boolean(requestIdParts) && /^[a-z]{3}\d$/.test(requestIdParts[1]),
    requestIdRegionLength: requestIdParts?.[1].length ?? null,
    requestIdOpaqueLength: requestIdParts?.[2].length ?? null,
    requestIdOpaqueAlphabetExact:
      Boolean(requestIdParts) &&
      /^[A-Za-z0-9_-]+$/.test(requestIdParts[2]),
    localFixedBodyExact: exactLocalRejection,
    localFixedBodySha256: exactLocalRejection
      ? LOCAL_NEXT_IMAGE_DISALLOWED_BODY_SHA256
      : null,
    optimizedImageReturned: false,
    nonDataProviderRejection:
      exactVercelEdgeRejection || exactLocalRejection,
    rawBodyPersisted: false,
    rawBodySha256Persisted: false,
    rawRequestIdPersisted: false,
    rawVercelErrorPersisted: false,
  });
}

export function assertExactNextImageOptimizerSixModeMatrix(matrix) {
  if (
    !matrix ||
    typeof matrix !== "object" ||
    Array.isArray(matrix) ||
    JSON.stringify(Object.keys(matrix)) !== JSON.stringify(SIX_MODE_KEYS)
  ) {
    throw new Error("Image optimizer proof did not contain the exact six-mode matrix");
  }
  const results = SIX_MODE_KEYS.map((key) => matrix[key]);
  if (results.some((result) => result?.accepted !== true)) {
    throw new Error("Image optimizer proof contained a non-exact rejection response");
  }
  const dispositions = [...new Set(results.map(({ disposition }) => disposition))];
  if (dispositions.length !== 1) {
    throw new Error("Image optimizer six-mode responses did not classify identically");
  }
  if (dispositions[0] !== "EXACT_VERCEL_EDGE_IMAGE_OPTIMIZER_REJECTION") {
    throw new Error(
      "Hosted image optimizer proof was not the exact Vercel edge rejection",
    );
  }
  if (
    results.some(
      (result) =>
        result.optimizedImageReturned !== false ||
        result.nonDataProviderRejection !== true ||
        result.rawBodyPersisted !== false ||
        result.rawBodySha256Persisted !== false ||
        result.rawRequestIdPersisted !== false ||
        result.rawVercelErrorPersisted !== false,
    )
  ) {
    throw new Error("Image optimizer proof violated its closed evidence contract");
  }
  return dispositions[0];
}
