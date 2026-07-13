import { createHash } from "node:crypto";
import { GHL_PROVIDER_BASE_URL } from "./sandbox-gate";

export type GhlHttpMethod = "GET" | "POST" | "PUT" | "DELETE";
export type GhlHttpRetryMode = "safe-read" | "no-retry";

export type GhlHttpResponse<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  providerRequestId: string | null;
  responseFingerprint: string;
  retryAfterMs: number | null;
};

export class GhlHttpTransportError extends Error {
  readonly code: "ghl_timeout" | "ghl_network_error" | "ghl_response_too_large";
  readonly uncertain: boolean;

  constructor(
    code: GhlHttpTransportError["code"],
    message: string,
    uncertain: boolean,
  ) {
    super(message);
    this.name = "GhlHttpTransportError";
    this.code = code;
    this.uncertain = uncertain;
  }
}

export type GhlHttpClientOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxReadAttempts?: number;
  maxResponseBytes?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

function parseRetryAfter(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1000), 60_000);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.min(Math.max(timestamp - Date.now(), 0), 60_000);
}

function responseFingerprint(rawBody: string) {
  return createHash("sha256").update(rawBody).digest("hex");
}

function providerRequestId(headers: Headers) {
  return headers.get("x-request-id")
    ?? headers.get("x-correlation-id")
    ?? headers.get("trace-id")
    ?? null;
}

export class GhlHttpClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxReadAttempts: number;
  private readonly maxResponseBytes: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: GhlHttpClientOptions = {}) {
    const baseUrl = new URL(options.baseUrl ?? GHL_PROVIDER_BASE_URL);
    if (baseUrl.origin !== GHL_PROVIDER_BASE_URL || baseUrl.pathname !== "/") {
      throw new Error("The GHL HTTP client base URL is outside the exact HTTPS allowlist.");
    }
    this.baseUrl = baseUrl.origin;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = Math.min(Math.max(options.timeoutMs ?? 10_000, 1_000), 30_000);
    this.maxReadAttempts = Math.min(Math.max(options.maxReadAttempts ?? 3, 1), 4);
    this.maxResponseBytes = Math.min(
      Math.max(options.maxResponseBytes ?? 1_000_000, 16_384),
      2_000_000,
    );
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }));
  }

  async request<T>(input: {
    method: GhlHttpMethod;
    path: string;
    credential: string;
    body?: Record<string, unknown>;
    version?: string;
    retryMode?: GhlHttpRetryMode;
  }): Promise<GhlHttpResponse<T>> {
    if (!input.path.startsWith("/") || input.path.startsWith("//")) {
      throw new Error("GHL request paths must be relative to the exact provider allowlist.");
    }
    const url = new URL(input.path, this.baseUrl);
    if (url.origin !== GHL_PROVIDER_BASE_URL) {
      throw new Error("GHL request escaped the exact provider allowlist.");
    }

    const retryMode = input.retryMode ?? (input.method === "GET" ? "safe-read" : "no-retry");
    const maxAttempts = retryMode === "safe-read" ? this.maxReadAttempts : 1;
    let lastResponse: GhlHttpResponse<T> | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher(url, {
          method: input.method,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${input.credential}`,
            Version: input.version ?? "2021-07-28",
            ...(input.body ? { "Content-Type": "application/json" } : {}),
          },
          body: input.body ? JSON.stringify(input.body) : undefined,
          redirect: "error",
          signal: controller.signal,
        });
        const rawBody = await response.text();
        if (Buffer.byteLength(rawBody, "utf8") > this.maxResponseBytes) {
          throw new GhlHttpTransportError(
            "ghl_response_too_large",
            "The GHL response exceeded the bounded response size.",
            input.method !== "GET",
          );
        }
        let data: T | null = null;
        if (rawBody) {
          try {
            data = JSON.parse(rawBody) as T;
          } catch {
            data = null;
          }
        }
        lastResponse = {
          ok: response.ok,
          status: response.status,
          data,
          providerRequestId: providerRequestId(response.headers),
          responseFingerprint: responseFingerprint(rawBody),
          retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
        };
        const retryableRead = retryMode === "safe-read"
          && attempt < maxAttempts
          && (response.status === 408 || response.status === 429 || response.status >= 500);
        if (!retryableRead) return lastResponse;
        await this.sleep(lastResponse.retryAfterMs ?? Math.min(250 * (2 ** (attempt - 1)), 2_000));
      } catch (error) {
        if (error instanceof GhlHttpTransportError) throw error;
        const aborted = controller.signal.aborted
          || (error instanceof DOMException && error.name === "AbortError");
        if (retryMode === "safe-read" && attempt < maxAttempts) {
          await this.sleep(Math.min(250 * (2 ** (attempt - 1)), 2_000));
          continue;
        }
        throw new GhlHttpTransportError(
          aborted ? "ghl_timeout" : "ghl_network_error",
          aborted
            ? "The GHL provider request exceeded the bounded timeout."
            : "The GHL provider request failed before a conclusive response.",
          input.method !== "GET",
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    if (lastResponse) return lastResponse;
    throw new GhlHttpTransportError(
      "ghl_network_error",
      "The GHL provider request failed before a response was available.",
      input.method !== "GET",
    );
  }
}
