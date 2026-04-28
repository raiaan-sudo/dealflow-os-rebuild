import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { logError, logWarn } from "@/lib/logging";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = "api_error") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type ApiRouteCategory = "read" | "write" | "generation" | "provider_integration";

export type ApiFallbackPayload<T> = T & {
  success: false;
  fallback: true;
  error: string;
  code: string;
  requestId?: string;
};

export function apiSuccess<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function apiFailure(
  message: string,
  code: string,
  status: number,
  options?: {
    details?: unknown;
    requestId?: string;
  },
) {
  return NextResponse.json(
    {
      error: message,
      code,
      ...(options?.requestId ? { requestId: options.requestId } : {}),
      ...(options?.details !== undefined ? { details: options.details } : {}),
    },
    { status },
  );
}

export function apiSafeFallback<T extends Record<string, unknown>>(
  payload: T,
  options?: {
    status?: number;
    code?: string;
    message?: string;
    requestId?: string;
  },
) {
  return NextResponse.json(
    {
      ...payload,
      success: false,
      fallback: true,
      error: options?.message ?? "Safe fallback response returned.",
      code: options?.code ?? "safe_fallback",
      ...(options?.requestId ? { requestId: options.requestId } : {}),
    } satisfies ApiFallbackPayload<T>,
    { status: options?.status ?? 200 },
  );
}

export function unauthorizedOrConfigError() {
  if (!hasSupabaseEnv()) {
    return new ApiError(
      503,
      "Supabase is not configured. Add the required environment variables before using this route.",
      "config_missing",
    );
  }

  return new ApiError(401, "Authentication is required for this route.", "unauthorized");
}

export function assertSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  const expectedOrigins = new Set<string>();

  if (host) {
    expectedOrigins.add(`https://${host}`);
    expectedOrigins.add(`http://${host}`);
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      expectedOrigins.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
    } catch {
      // Ignore invalid optional app URL here. Startup/schema checks validate env separately.
    }
  }

  let candidate = origin ?? null;

  if (!candidate && referer) {
    try {
      candidate = new URL(referer).origin;
    } catch {
      throw new ApiError(403, "Cross-site request rejected.", "csrf_rejected");
    }
  }

  if (!candidate) {
    throw new ApiError(403, "Cross-site request rejected.", "csrf_rejected");
  }

  if (!expectedOrigins.has(candidate)) {
    throw new ApiError(403, "Cross-site request rejected.", "csrf_rejected");
  }
}

export async function parseJsonBody<T>(
  request: Request,
  schema: { parse: (input: unknown) => T },
) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.", "invalid_json");
  }

  return schema.parse(body);
}

export async function parseOptionalJsonBody<T>(
  request: Request,
  schema: { parse: (input: unknown) => T },
  fallback: T,
) {
  let raw = "";

  try {
    raw = await request.text();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.", "invalid_json");
  }

  if (!raw.trim()) {
    return fallback;
  }

  try {
    return schema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ApiError(400, "Request body must be valid JSON.", "invalid_json");
    }

    throw error;
  }
}

export async function parseRouteParams<T>(
  params: Promise<Record<string, string>> | Record<string, string>,
  schema: { parse: (input: unknown) => T },
) {
  const resolved = params instanceof Promise ? await params : params;
  return schema.parse(resolved);
}

export async function withRouteTimeout<T>(
  task: Promise<T>,
  options: {
    timeoutMs: number;
    message: string;
    code?: string;
    status?: number;
  },
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new ApiError(
          options.status ?? 504,
          options.message,
          options.code ?? "route_timeout",
        ),
      );
    }, options.timeoutMs);
  });

  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function retryRouteStep<T>(
  operation: () => Promise<T>,
  options?: {
    retries?: number;
    delayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  },
) {
  const retries = options?.retries ?? 0;
  const delayMs = options?.delayMs ?? 250;
  const shouldRetry =
    options?.shouldRetry ??
    ((error: unknown) =>
      error instanceof ApiError
        ? error.status === 408 || error.status === 429 || error.status >= 500
        : error instanceof Error
          ? error.name === "AbortError" || error.name === "TypeError"
          : false);

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= retries || !shouldRetry(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Route retry failed.");
}

export function handleApiError(error: unknown, context: string) {
  const requestId = crypto.randomUUID();
  const isProduction = process.env.NODE_ENV === "production";

  if (error instanceof ZodError) {
    const message = error.issues[0]?.message ?? "Request validation failed.";
    logWarn(`${context} validation failed`, {
      requestId,
      issues: error.issues,
    });
    return apiFailure(message, "validation_error", 400, {
      requestId,
      details: isProduction ? undefined : error.issues,
    });
  }

  if (error instanceof ApiError) {
    if (error.status >= 500) {
      logError(`${context} failed`, {
        requestId,
        code: error.code,
        message: error.message,
      });
    } else {
      logWarn(`${context} rejected`, {
        requestId,
        code: error.code,
        message: error.message,
      });
    }

    return apiFailure(error.message, error.code, error.status, { requestId });
  }

  const message = error instanceof Error ? error.message : "Unexpected server error.";
  logError(`${context} failed`, { requestId, message });
  return apiFailure(
    isProduction ? "Unexpected server error." : message,
    "internal_error",
    500,
    { requestId },
  );
}
