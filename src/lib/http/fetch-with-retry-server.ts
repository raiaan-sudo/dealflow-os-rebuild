type FetchWithRetryServerOptions = RequestInit & {
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export async function fetchWithRetryServer(
  input: RequestInfo | URL,
  options: FetchWithRetryServerOptions = {},
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
    const handleExternalAbort = () => controller.abort();
    externalSignal?.addEventListener("abort", handleExternalAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", handleExternalAbort);

      if (!response.ok && shouldRetry(null, response) && attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", handleExternalAbort);
      lastError = error;

      if (!shouldRetry(error) || attempt >= retries) {
        throw error;
      }

      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed.");
}
