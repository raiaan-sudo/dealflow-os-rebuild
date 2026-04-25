export function debugLog(scope: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  if (payload) {
    console.debug(`[${scope}]`, payload);
    return;
  }

  console.debug(`[${scope}]`);
}
