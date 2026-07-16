const EXACT_HOMEPAGE_PREFETCH_PATHS = new Set([
  "/",
  "/data-deletion",
  "/login",
  "/privacy",
  "/terms",
]);

function hasExactPrefetchQueryShape(url) {
  const keys = [...url.searchParams.keys()].sort();
  const rscValues = url.searchParams.getAll("_rsc");
  if (
    new Set(keys).size !== keys.length ||
    rscValues.length !== 1 ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(rscValues[0] ?? "")
  ) {
    return false;
  }

  if (url.pathname === "/login") {
    const exactSignInPrefetch =
      keys.length === 1 && keys[0] === "_rsc";
    const exactSignUpPrefetch =
      keys.length === 2 &&
      keys[0] === "_rsc" &&
      keys[1] === "mode" &&
      url.searchParams.get("mode") === "sign-up";
    return exactSignInPrefetch || exactSignUpPrefetch;
  }

  return keys.length === 1 && keys[0] === "_rsc";
}

/**
 * Next App Router may emit a response and then cancel the unread body of a
 * speculative Link prefetch when the link leaves the viewport or unmounts.
 * Suppress only that exact, previously-successful homepage prefetch. General
 * request failures and all navigation cancellations remain independently
 * classified by the caller.
 */
export function isExpectedCanceledHomepagePrefetch({
  applicationOrigin,
  errorText,
  frameUrl,
  isNavigationRequest,
  method,
  nextRouterPrefetchHeader,
  requestUrl,
  resourceType,
  rscHeader,
  successfulResponseStatus,
}) {
  let expectedOrigin;
  let request;
  let frame;
  try {
    expectedOrigin = new URL(applicationOrigin);
    request = new URL(requestUrl);
    frame = new URL(frameUrl);
  } catch {
    return false;
  }

  if (
    expectedOrigin.pathname !== "/" ||
    expectedOrigin.search !== "" ||
    expectedOrigin.hash !== "" ||
    expectedOrigin.username !== "" ||
    expectedOrigin.password !== "" ||
    !["http:", "https:"].includes(expectedOrigin.protocol) ||
    request.origin !== expectedOrigin.origin ||
    request.username !== "" ||
    request.password !== "" ||
    request.hash !== "" ||
    frame.origin !== expectedOrigin.origin ||
    frame.pathname !== "/" ||
    frame.search !== "" ||
    frame.hash !== "" ||
    frame.username !== "" ||
    frame.password !== ""
  ) {
    return false;
  }

  return (
    method === "GET" &&
    resourceType === "fetch" &&
    isNavigationRequest === false &&
    errorText === "net::ERR_ABORTED" &&
    rscHeader === "1" &&
    nextRouterPrefetchHeader === "1" &&
    successfulResponseStatus === 200 &&
    EXACT_HOMEPAGE_PREFETCH_PATHS.has(request.pathname) &&
    hasExactPrefetchQueryShape(request)
  );
}
