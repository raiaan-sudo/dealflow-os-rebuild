import { ApiError } from "@/lib/api/route";
import { logWarn } from "@/lib/logging";

export type MetaRequestPurpose =
  | "oauth"
  | "discovery"
  | "preflight"
  | "launch_lookup"
  | "launch_create"
  | "sync";

type MetaRequestOptions = RequestInit & {
  purpose: MetaRequestPurpose;
  requestId?: string;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
};

const META_TIMEOUTS_MS: Record<MetaRequestPurpose, number> = {
  oauth: 10_000,
  discovery: 12_000,
  preflight: 10_000,
  launch_lookup: 10_000,
  launch_create: 15_000,
  sync: 12_000,
};

const META_RETRIES: Record<MetaRequestPurpose, number> = {
  oauth: 1,
  discovery: 2,
  preflight: 2,
  launch_lookup: 2,
  launch_create: 2,
  sync: 2,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableMetaStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

export function isRetryableMetaError(error: unknown) {
  if (error instanceof ApiError) {
    return (
      error.code === "meta_temporary_unavailable" ||
      error.status === 408 ||
      error.status === 429 ||
      error.status >= 500
    );
  }

  if (error instanceof Error) {
    return error.name === "AbortError" || error.name === "TypeError";
  }

  return false;
}

function getMetaTemporaryFailureMessage(purpose: MetaRequestPurpose, response?: Response | null) {
  if (response?.status === 429) {
    return "Meta rate limited the request.";
  }

  if (response?.status === 408 || response?.status === 504) {
    return "Meta request timed out.";
  }

  if (purpose === "launch_create") {
    return "Meta is unavailable while creating launch objects.";
  }

  if (purpose === "preflight" || purpose === "discovery") {
    return "Meta is slow to respond right now.";
  }

  return "Meta is temporarily unavailable.";
}

function buildTimeoutError(purpose: MetaRequestPurpose, timeoutMs: number) {
  return new ApiError(
    504,
    `Meta request timed out after ${timeoutMs}ms during ${purpose}.`,
    "meta_temporary_unavailable",
  );
}

export async function fetchMetaResponse(
  input: RequestInfo | URL,
  options: MetaRequestOptions,
) {
  const {
    purpose,
    requestId,
    retries = META_RETRIES[purpose],
    retryDelayMs = 500,
    timeoutMs = META_TIMEOUTS_MS[purpose],
    signal: externalSignal,
    ...init
  } = options;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const handleExternalAbort = () =>
      controller.abort(externalSignal?.reason ?? new Error("Meta request cancelled."));
    externalSignal?.addEventListener("abort", handleExternalAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(buildTimeoutError(purpose, timeoutMs)), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", handleExternalAbort);

      if (isRetryableMetaStatus(response.status) && attempt < retries) {
        logWarn("Meta request retrying", {
          requestId: requestId ?? null,
          purpose,
          attempt: attempt + 1,
          retries,
          status: response.status,
          userMessage: "Meta is slow, retrying.",
        });
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      if (isRetryableMetaStatus(response.status) && attempt >= retries) {
        throw new ApiError(
          response.status === 429 ? 429 : 503,
          getMetaTemporaryFailureMessage(purpose, response),
          "meta_temporary_unavailable",
        );
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", handleExternalAbort);
      lastError = controller.signal.aborted && controller.signal.reason ? controller.signal.reason : error;

      if (attempt >= retries || !isRetryableMetaError(lastError)) {
        throw lastError instanceof ApiError
          ? lastError
          : new ApiError(
              503,
              getMetaTemporaryFailureMessage(purpose),
              "meta_temporary_unavailable",
            );
      }

      logWarn("Meta request retrying", {
        requestId: requestId ?? null,
        purpose,
        attempt: attempt + 1,
        retries,
        error:
          lastError instanceof Error ? lastError.message : "Unknown Meta request retryable error.",
        userMessage: "Meta is slow, retrying.",
      });
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError instanceof ApiError
    ? lastError
    : new ApiError(503, getMetaTemporaryFailureMessage(options.purpose), "meta_temporary_unavailable");
}

export async function fetchMetaJson<T>(
  input: RequestInfo | URL,
  options: MetaRequestOptions,
) {
  const response = await fetchMetaResponse(input, options);
  const data = (await response.json().catch(() => null)) as T | null;
  return {
    response,
    data,
  };
}
