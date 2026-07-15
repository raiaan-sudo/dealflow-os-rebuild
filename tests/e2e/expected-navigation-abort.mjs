const EXACT_NAVIGATION_ABORTS = new Set([
  "net::ERR_ABORTED",
  "NS_BINDING_ABORTED",
  "cancelled",
  "Load cancelled",
  "Request cancelled",
  "Load request cancelled",
]);

/**
 * Playwright reports a replaced document navigation with engine-specific
 * error text. Only suppress the exact known Chromium, Firefox, and WebKit
 * cancellation strings. Callers must pass errorText only, never a URL or a
 * combined diagnostic record.
 */
export function isExpectedNavigationAbort(errorText) {
  const normalized = String(errorText ?? "").trim();
  return EXACT_NAVIGATION_ABORTS.has(normalized);
}
