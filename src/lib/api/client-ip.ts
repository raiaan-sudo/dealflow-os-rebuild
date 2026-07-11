import { isIP } from "node:net";

type ClientIpEnvironment = {
  NODE_ENV?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
};

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() ?? "";
}

export function normalizeClientIp(value: string | null | undefined) {
  let candidate = firstHeaderValue(value ?? null);
  if (!candidate) return null;

  if (candidate.startsWith("[")) {
    const closingBracket = candidate.indexOf("]");
    if (closingBracket < 0) return null;
    const suffix = candidate.slice(closingBracket + 1);
    if (suffix && !/^:\d{1,5}$/.test(suffix)) return null;
    candidate = candidate.slice(1, closingBracket);
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  }

  return isIP(candidate) ? candidate.toLowerCase() : null;
}

/**
 * Vercel documents x-vercel-forwarded-for as the edge-controlled client-IP
 * header that remains distinct when a proxy overwrites x-forwarded-for. In a
 * non-Vercel production runtime we deliberately refuse unpinned proxy headers;
 * a deployment-specific trusted-proxy contract must be added before using one.
 */
export function getTrustedRequestIp(
  request: Request | { headers: Headers },
  environment: ClientIpEnvironment = process.env,
) {
  const isVercel = environment.VERCEL === "1" || Boolean(environment.VERCEL_ENV);
  if (isVercel) {
    return normalizeClientIp(request.headers.get("x-vercel-forwarded-for")) ?? "anonymous";
  }

  if (environment.NODE_ENV !== "production") {
    return (
      normalizeClientIp(request.headers.get("x-forwarded-for")) ??
      normalizeClientIp(request.headers.get("x-real-ip")) ??
      "anonymous"
    );
  }

  return "anonymous";
}
