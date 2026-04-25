type FetchWithRetryOptions = RequestInit & {
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shouldRetry(error: unknown, response?: Response | null) {
  if (response) {
    return response.status === 408 || response.status === 429 || response.status >= 500;
  }

  if (error instanceof Error) {
    return error.name === "AbortError" || error.name === "TypeError";
  }

  return false;
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  options: FetchWithRetryOptions = {},
) {
  const {
    retries = 2,
    retryDelayMs = 450,
    timeoutMs = 6000,
    signal: externalSignal,
    ...init
  } = options;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutError = new Error(`Request timed out after ${timeoutMs}ms.`);
    const handleExternalAbort = () => controller.abort(externalSignal?.reason ?? new Error("Request was cancelled."));
    externalSignal?.addEventListener("abort", handleExternalAbort, { once: true });
    const timeout = window.setTimeout(() => controller.abort(timeoutError), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      window.clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", handleExternalAbort);

      if (!response.ok && shouldRetry(null, response) && attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      window.clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", handleExternalAbort);
      lastError =
        controller.signal.aborted && controller.signal.reason instanceof Error
          ? controller.signal.reason
          : error;

      if (!shouldRetry(error) || attempt >= retries) {
        throw lastError;
      }

      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed.");
}
