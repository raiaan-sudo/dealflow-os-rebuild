import { ApiError } from "@/lib/api/route";

export type StaticCreativeGenerationStage =
  | "queued"
  | "starting_save_retry"
  | "rendering"
  | "assets_persisting"
  | "plan_finalizing"
  | "completed"
  | "retryable_save_failed"
  | "failed";

export const STATIC_CREATIVE_TRANSIENT_SAVE_ERROR_CODES = new Set([
  "campaign_static_generation_state_save_failed",
  "campaign_static_generation_final_save_failed",
  "creative_asset_transient_persist_failed",
]);

const TRANSIENT_MESSAGE_PATTERN =
  /fetch failed|und_err_socket|econnreset|etimedout|aborterror|socket|connection (?:closed|reset)|statement timeout|canceling statement due to statement timeout|postgrest.*5\d\d|service unavailable|temporar|network|timeout|timed out/i;

const NON_TRANSIENT_CODE_PATTERN =
  /auth|ownership|validation|brief|mismatch|not_found|conflict|stale|permission|forbidden|unauthorized|schema|malformed|row-level security|rls/i;

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

export function isTransientStaticCreativePersistenceError(error: unknown) {
  if (error instanceof ApiError) {
    if (STATIC_CREATIVE_TRANSIENT_SAVE_ERROR_CODES.has(error.code)) {
      return true;
    }

    if (NON_TRANSIENT_CODE_PATTERN.test(error.code)) {
      return false;
    }

    if (error.code === "creative_asset_persist_failed") {
      return TRANSIENT_MESSAGE_PATTERN.test(error.message);
    }

    return (
      error.status === 408 ||
      error.status === 429 ||
      error.status >= 500 ||
      TRANSIENT_MESSAGE_PATTERN.test(error.message)
    );
  }

  if (error instanceof Error) {
    return (
      error.name === "AbortError" ||
      error.name === "TypeError" ||
      TRANSIENT_MESSAGE_PATTERN.test(error.message)
    );
  }

  return false;
}

function retryDelayMs(attemptIndex: number) {
  const baseDelays = [300, 900, 1800];
  const base = baseDelays[Math.min(attemptIndex, baseDelays.length - 1)] ?? 1800;
  return base + Math.floor(Math.random() * 120);
}

export async function retryStaticCreativePersistence<T>(
  operation: () => Promise<T>,
  options?: {
    attempts?: number;
    onRetry?: (error: unknown, nextAttempt: number) => Promise<void> | void;
  },
) {
  const attempts = Math.max(1, options?.attempts ?? 3);
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= attempts - 1 || !isTransientStaticCreativePersistenceError(error)) {
        throw error;
      }

      await options?.onRetry?.(error, attempt + 2);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Static creative persistence retry failed.");
}

export function toStaticCreativePersistenceApiError(
  error: unknown,
  transientCode: string,
  nonTransientCode = transientCode,
) {
  const message = getErrorMessage(error);
  const retryable = isTransientStaticCreativePersistenceError(error);

  if (error instanceof ApiError && !retryable) {
    return error;
  }

  return new ApiError(500, message, retryable ? transientCode : nonTransientCode);
}
