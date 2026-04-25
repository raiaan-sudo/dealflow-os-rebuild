// @ts-nocheck
import { NextResponse } from "next/server";
import { logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/supabase/admin";
type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export type RateLimitAdapter = {
  name: string;
  consume(options: RateLimitOptions): Promise<RateLimitResult> | RateLimitResult;
};

const RATE_LIMIT_BUCKETS = new Map<string, Bucket>();
let supabaseAdapter: RateLimitAdapter | null | undefined;
let durableRateLimitFallbackLogged = false;

declare global {
  // eslint-disable-next-line no-var
  var __DEALFLOW_RATE_LIMIT_ADAPTER__: RateLimitAdapter | undefined;
}

function getNow() {
  return Date.now();
}

function cleanupExpiredBuckets(now: number) {
  for (const [key, bucket] of RATE_LIMIT_BUCKETS.entries()) {
    if (bucket.resetAt <= now) {
      RATE_LIMIT_BUCKETS.delete(key);
    }
  }
}

class MemoryRateLimitAdapter implements RateLimitAdapter {
  name = "memory";

  consume(options: RateLimitOptions): RateLimitResult {
    const now = getNow();
    cleanupExpiredBuckets(now);

    const existing = RATE_LIMIT_BUCKETS.get(options.key);

    if (!existing || existing.resetAt <= now) {
      RATE_LIMIT_BUCKETS.set(options.key, {
        count: 1,
        resetAt: now + options.windowMs,
      });

      return {
        allowed: true,
        remaining: Math.max(options.limit - 1, 0),
        resetAt: now + options.windowMs,
      };
    }

    if (existing.count >= options.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: existing.resetAt,
      };
    }

    existing.count += 1;
    RATE_LIMIT_BUCKETS.set(options.key, existing);

    return {
      allowed: true,
      remaining: Math.max(options.limit - existing.count, 0),
      resetAt: existing.resetAt,
    };
  }
}

class SupabaseRateLimitAdapter implements RateLimitAdapter {
  name = "supabase";

  async consume(options: RateLimitOptions): Promise<RateLimitResult> {
    const admin = createAdminClient();

    if (!admin) {
      throw new Error("Supabase admin client unavailable for rate limiting.");
    }

    const { data, error } = await (admin as any).rpc("consume_rate_limit_bucket", {
      bucket_key: options.key,
      max_requests: options.limit,
      window_ms: options.windowMs,
    });

    if (error) {
      throw new Error(error.message || "Rate limit bucket could not be updated.");
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) {
      throw new Error("Rate limit bucket returned no result.");
    }

    return {
      allowed: Boolean(row.allowed),
      remaining:
        typeof row.remaining === "number"
          ? Math.max(row.remaining, 0)
          : 0,
      resetAt: new Date(row.reset_at).getTime(),
    };
  }
}

function shouldFallbackToMemoryRateLimit(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return (
    message.includes("consume_rate_limit_bucket") ||
    message.includes("rate limit bucket") ||
    message.includes("reset_at")
  );
}

function getSupabaseAdapter() {
  if (supabaseAdapter !== undefined) {
    return supabaseAdapter;
  }

  supabaseAdapter = createAdminClient() ? new SupabaseRateLimitAdapter() : null;
  return supabaseAdapter;
}

function getConfiguredAdapter(): RateLimitAdapter | null {
  if (globalThis.__DEALFLOW_RATE_LIMIT_ADAPTER__) {
    return globalThis.__DEALFLOW_RATE_LIMIT_ADAPTER__;
  }

  if (process.env.NODE_ENV === "production") {
    return getSupabaseAdapter();
  }

  if (process.env.NODE_ENV === "development") {
    return new MemoryRateLimitAdapter();
  }

  return null;
}

export function registerRateLimitAdapter(adapter: RateLimitAdapter) {
  globalThis.__DEALFLOW_RATE_LIMIT_ADAPTER__ = adapter;
}

export async function consumeRateLimit(options: RateLimitOptions): Promise<RateLimitResult | null> {
  const adapter = getConfiguredAdapter();

  if (!adapter) {
    logWarn("Rate limit adapter unavailable", {
      key: options.key,
      windowMs: options.windowMs,
      limit: options.limit,
    });
    return null;
  }

  try {
    return await adapter.consume(options);
  } catch (error) {
    if (adapter.name === "supabase" && shouldFallbackToMemoryRateLimit(error)) {
      if (!durableRateLimitFallbackLogged) {
        durableRateLimitFallbackLogged = true;
        logWarn("Supabase rate limit function unavailable, falling back to memory adapter", {
          key: options.key,
        });
      }

      return new MemoryRateLimitAdapter().consume(options);
    }

    throw error;
  }
}

export function getRateLimitKey(
  request: Request | { headers: Headers; url: string },
  bucket: string,
  identifier?: string | null,
) {
  if (identifier) {
    return `${bucket}:${identifier}`;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwardedFor?.split(",")[0]?.trim() || realIp || "anonymous";
  return `${bucket}:${ip}`;
}

export function buildRateLimitResponse(resetAt: number) {
  return NextResponse.json(
    {
      error: "Too many requests.",
      code: "rate_limited",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(Math.ceil((resetAt - Date.now()) / 1000), 1)),
      },
    },
  );
}
