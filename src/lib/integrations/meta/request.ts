import { ApiError } from "@/lib/api/route";
import {
  assertMetaUrlHasNoCredentials,
  isMetaCapiWriteAllowed,
  isMetaLiveWriteAllowed,
} from "@/lib/integrations/meta/contract";
import { logWarn } from "@/lib/logging";

export type MetaRequestPurpose =
  | "oauth_code_exchange"
  | "oauth_token_extension"
  | "discovery"
  | "preflight"
  | "lead_lookup"
  | "launch_lookup"
  | "launch_create"
  | "conversion"
  | "sync";

type MetaRequestOptions = RequestInit & {
  purpose: MetaRequestPurpose;
  requestId?: string;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
};

const META_TIMEOUTS_MS: Record<MetaRequestPurpose, number> = {
  oauth_code_exchange: 10_000,
  oauth_token_extension: 10_000,
  discovery: 12_000,
  preflight: 10_000,
  lead_lookup: 12_000,
  launch_lookup: 10_000,
  launch_create: 15_000,
  conversion: 15_000,
  sync: 12_000,
};

const META_RETRIES: Record<MetaRequestPurpose, number> = {
  oauth_code_exchange: 0,
  oauth_token_extension: 1,
  discovery: 2,
  preflight: 2,
  lead_lookup: 2,
  launch_lookup: 2,
  launch_create: 0,
  conversion: 0,
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
  assertMetaUrlHasNoCredentials(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );

  const {
    purpose,
    requestId,
    retries: requestedRetries,
    retryDelayMs = 500,
    timeoutMs = META_TIMEOUTS_MS[purpose],
    signal: externalSignal,
    ...init
  } = options;
  const method = typeof init.method === "string" ? init.method.toUpperCase() : "GET";
  const isProviderWrite = method !== "GET" && method !== "HEAD";
  if (isProviderWrite && purpose === "launch_create" && !isMetaLiveWriteAllowed()) {
    throw new ApiError(
      403,
      "Live Meta writes are disabled. Explicitly enable the guarded launch flow before sending provider mutations.",
      "meta_live_launch_disabled",
    );
  }

  if (isProviderWrite && purpose === "conversion" && !isMetaCapiWriteAllowed()) {
    throw new ApiError(
      403,
      "Meta Conversions API events are disabled. Enable the separate CAPI policy only after consent and tracking acceptance.",
      "meta_capi_events_disabled",
    );
  }

  const isNonIdempotentLaunchCreate =
    purpose === "launch_create" && method !== "GET" && method !== "HEAD";
  const retries = isNonIdempotentLaunchCreate
    ? 0
    : requestedRetries ?? META_RETRIES[purpose];

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

      if (
        isRetryableMetaStatus(response.status) &&
        attempt >= retries &&
        isNonIdempotentLaunchCreate
      ) {
        return response;
      }

      if (isRetryableMetaStatus(response.status) && attempt >= retries) {
        if (purpose === "oauth_code_exchange") {
          throw new ApiError(
            503,
            "Meta authorization-code exchange did not return a definitive result. The one-time code was not retried; reconnect Meta to continue.",
            "meta_oauth_code_exchange_ambiguous",
          );
        }
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
        if (
          purpose === "oauth_code_exchange" &&
          !(lastError instanceof ApiError && lastError.code === "meta_oauth_code_exchange_ambiguous")
        ) {
          throw new ApiError(
            503,
            "Meta authorization-code exchange did not return a definitive result. The one-time code was not retried; reconnect Meta to continue.",
            "meta_oauth_code_exchange_ambiguous",
          );
        }
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
