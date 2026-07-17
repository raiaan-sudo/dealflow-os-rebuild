import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getInternalSystemJobSecrets, hasSupabaseEnv } from "@/lib/env";
import { logError, logWarn } from "@/lib/logging";
import { AdvertisingClaimUnverifiedError } from "@/lib/copy/claim-safety";

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

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function addExpectedOrigin(expectedOrigins: Set<string>, value: string | null | undefined) {
  if (!value) {
    return;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      expectedOrigins.add(parsed.origin);
    }
  } catch {
    // Ignore invalid optional origins; request candidates are validated separately.
  }
}

function addHostOrigin(
  expectedOrigins: Set<string>,
  host: string | null,
  protocol: string | null,
) {
  if (!host) {
    return;
  }

  const normalizedProtocol = protocol === "http" || protocol === "https" ? protocol : "https";
  addExpectedOrigin(expectedOrigins, `${normalizedProtocol}://${host}`);

  try {
    const parsed = new URL(`${normalizedProtocol}://${host}`);
    if (isLocalHostname(parsed.hostname)) {
      addExpectedOrigin(expectedOrigins, `http://${host}`);
      addExpectedOrigin(expectedOrigins, `https://${host}`);
    }
  } catch {
    // Ignore malformed Host headers; they will not be accepted as candidates.
  }
}

function normalizeRequestOrigin(value: string | null, errorCode = "csrf_rejected") {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Unsupported origin protocol.");
    }

    return parsed.origin;
  } catch {
    throw new ApiError(403, "Cross-site request rejected.", errorCode);
  }
}

function timingSafeTokenEquals(candidate: string | null, expected: string) {
  if (!candidate || !expected) {
    return false;
  }

  let mismatch = candidate.length ^ expected.length;
  const length = Math.max(candidate.length, expected.length);

  for (let index = 0; index < length; index += 1) {
    mismatch |= candidate.charCodeAt(index % candidate.length) ^ expected.charCodeAt(index % expected.length);
  }

  return mismatch === 0;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export function assertSameOriginRequest(request: Request) {
  const origin = normalizeRequestOrigin(request.headers.get("origin"));
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? null;
  const expectedOrigins = new Set<string>();
  const isProduction = process.env.NODE_ENV === "production";

  if (process.env.NEXT_PUBLIC_APP_URL) {
    addExpectedOrigin(expectedOrigins, process.env.NEXT_PUBLIC_APP_URL);
  }

  if (!isProduction) {
    addExpectedOrigin(expectedOrigins, request.url);
    addHostOrigin(expectedOrigins, forwardedHost, forwardedProto);
    addHostOrigin(expectedOrigins, host, forwardedProto);
  }

  if (expectedOrigins.size === 0) {
    throw new ApiError(503, "Application origin is not configured.", "app_origin_missing");
  }

  let candidate = origin;

  if (!candidate && referer) {
    candidate = normalizeRequestOrigin(referer);
  }

  if (!candidate) {
    throw new ApiError(403, "Cross-site request rejected.", "csrf_rejected");
  }

  if (!expectedOrigins.has(candidate)) {
    throw new ApiError(403, "Cross-site request rejected.", "csrf_rejected");
  }
}

export function assertInternalSystemRequest(request: Request) {
  const secrets = getInternalSystemJobSecrets();

  if (secrets.length === 0) {
    throw new ApiError(
      503,
      "Internal system job runner secret is not configured.",
      "internal_runner_secret_missing",
    );
  }

  const token = getBearerToken(request) ?? request.headers.get("x-internal-system-key")?.trim() ?? null;

  if (!secrets.some((secret) => timingSafeTokenEquals(token, secret))) {
    throw new ApiError(401, "Internal system authorization is required.", "internal_unauthorized");
  }
}

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 128 * 1024;
export const DEFAULT_FORM_BODY_LIMIT_BYTES = 64 * 1024;
export const STRIPE_WEBHOOK_BODY_LIMIT_BYTES = 1024 * 1024;

export type BodyLimitOptions = {
  maxBytes?: number;
  code?: string;
};

function getDeclaredContentLength(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) {
    return null;
  }

  const parsed = Number.parseInt(contentLength, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function assertRequestBodySize(
  request: Request,
  maxBytes: number,
  code = "request_body_too_large",
) {
  const declaredLength = getDeclaredContentLength(request);

  if (declaredLength !== null && declaredLength > maxBytes) {
    throw new ApiError(413, "Request body is too large.", code);
  }
}

export async function parseTextBody(
  request: Request,
  options?: BodyLimitOptions,
) {
  const maxBytes = options?.maxBytes ?? DEFAULT_JSON_BODY_LIMIT_BYTES;
  const code = options?.code ?? "request_body_too_large";
  assertRequestBodySize(request, maxBytes, code);

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      throw new ApiError(413, "Request body is too large.", code);
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

export async function parseJsonBody<T>(
  request: Request,
  schema: { parse: (input: unknown) => T },
  options?: BodyLimitOptions,
) {
  let body: unknown;

  try {
    const raw = await parseTextBody(request, {
      maxBytes: options?.maxBytes ?? DEFAULT_JSON_BODY_LIMIT_BYTES,
      code: options?.code ?? "json_body_too_large",
    });
    body = JSON.parse(raw);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(400, "Request body must be valid JSON.", "invalid_json");
  }

  return schema.parse(body);
}

export async function parseOptionalJsonBody<T>(
  request: Request,
  schema: { parse: (input: unknown) => T },
  fallback: T,
  options?: BodyLimitOptions,
) {
  let raw = "";

  try {
    raw = await parseTextBody(request, {
      maxBytes: options?.maxBytes ?? DEFAULT_JSON_BODY_LIMIT_BYTES,
      code: options?.code ?? "json_body_too_large",
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

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

export async function parseFormDataBody(
  request: Request,
  options?: BodyLimitOptions,
) {
  const declaredLength = getDeclaredContentLength(request);

  if (declaredLength === null) {
    throw new ApiError(411, "Content-Length is required for form uploads.", "form_content_length_required");
  }

  assertRequestBodySize(
    request,
    options?.maxBytes ?? DEFAULT_FORM_BODY_LIMIT_BYTES,
    options?.code ?? "form_body_too_large",
  );

  return request.formData();
}

export async function parseRouteParams<T>(
  params: Promise<Record<string, string>> | Record<string, string>,
  schema: { parse: (input: unknown) => T },
) {
  const resolved = params instanceof Promise ? await params : params;
  return schema.parse(resolved);
}

export async function withRouteTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  options: {
    timeoutMs: number;
    message: string;
    code?: string;
    status?: number;
  },
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const controller = new AbortController();
  const taskPromise = task(controller.signal);

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
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
    return await Promise.race([taskPromise, timeoutPromise]);
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

  if (error instanceof AdvertisingClaimUnverifiedError) {
    logWarn(`${context} rejected`, {
      requestId,
      code: error.code,
      message: error.message,
      policyVersion: error.policyVersion,
      findings: error.findings,
    });
    return apiFailure(error.message, error.code, error.statusCode, { requestId });
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

    return apiFailure(
      isProduction && error.status >= 500 ? "Unexpected server error." : error.message,
      error.code,
      error.status,
      { requestId },
    );
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
