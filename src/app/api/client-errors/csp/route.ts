import { z } from "zod";
import { apiSuccess, ApiError, handleApiError, parseTextBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { hasSupabaseEnv } from "@/lib/env";
import { logOperationalEvent } from "@/lib/logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REPORT_BYTES = 16 * 1024;
const MAX_FIELD_LENGTH = 600;
const DROP_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

const cspReportSchema = z
  .object({
    "document-uri": z.string().max(1200).optional(),
    referrer: z.string().max(1200).optional(),
    "violated-directive": z.string().max(240).optional(),
    "effective-directive": z.string().max(240).optional(),
    "original-policy": z.string().max(5000).optional(),
    disposition: z.string().max(80).optional(),
    "blocked-uri": z.string().max(1200).optional(),
    "line-number": z.number().optional(),
    "column-number": z.number().optional(),
    "source-file": z.string().max(1200).optional(),
    "status-code": z.number().optional(),
    "script-sample": z.string().max(1200).optional(),
  })
  .passthrough();

const browserReportSchema = z
  .object({
    type: z.string().max(160).optional(),
    url: z.string().max(1200).optional(),
    body: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

type SanitizedReport = Record<string, unknown> & {
  type?: string;
  url?: string;
  body?: Record<string, unknown>;
};

function truncate(value: unknown, maxLength = MAX_FIELD_LENGTH) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function safeUrlHost(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = new URL(value);
    return {
      origin: parsed.origin,
      pathname: parsed.pathname.slice(0, 240),
    };
  } catch {
    return {
      origin: "invalid-url",
      pathname: null,
    };
  }
}

function normalizeReportPayload(payload: unknown) {
  if (payload && typeof payload === "object" && "csp-report" in payload) {
    return cspReportSchema.parse((payload as { "csp-report": unknown })["csp-report"]);
  }

  if (Array.isArray(payload)) {
    return payload.slice(0, 5).map((item) => browserReportSchema.parse(item));
  }

  return browserReportSchema.or(cspReportSchema).parse(payload);
}

export async function POST(request: Request) {
  try {
    if (!hasSupabaseEnv()) {
      return apiSuccess(
        { success: true, recorded: 0, dropped: true, reason: "supabase_env_unavailable" },
        { headers: DROP_RESPONSE_HEADERS },
      );
    }

    let rateLimit;
    try {
      rateLimit = await consumeRateLimit({
        key: getRateLimitKey(request, "client-csp-reports"),
        limit: 60,
        windowMs: 60_000,
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "rate_limit_unavailable") {
        return apiSuccess(
          { success: true, recorded: 0, dropped: true, reason: "rate_limit_unavailable" },
          { headers: DROP_RESPONSE_HEADERS },
        );
      }

      throw error;
    }

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const raw = await parseTextBody(request, {
      maxBytes: MAX_REPORT_BYTES,
      code: "csp_report_too_large",
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ApiError(400, "CSP report body must be valid JSON.", "invalid_csp_report_json");
    }

    const normalized = normalizeReportPayload(parsed);
    const reports = Array.isArray(normalized) ? normalized : [normalized];

    for (const report of reports) {
      const sanitizedReport = report as SanitizedReport;
      const body = sanitizedReport.body ? sanitizedReport.body : sanitizedReport;
      logOperationalEvent("client_csp_report_received", {
        type: truncate(sanitizedReport.type, 160),
        document: safeUrlHost(body["document-uri"] ?? sanitizedReport.url),
        blocked: safeUrlHost(body["blocked-uri"]),
        effectiveDirective: truncate(body["effective-directive"] ?? body["violated-directive"], 240),
        disposition: truncate(body.disposition, 80),
        statusCode: typeof body["status-code"] === "number" ? body["status-code"] : null,
        source: safeUrlHost(body["source-file"]),
      });
    }

    return apiSuccess(
      { success: true, recorded: reports.length },
      {
        headers: DROP_RESPONSE_HEADERS,
      },
    );
  } catch (error) {
    return handleApiError(error, "CSP report");
  }
}
