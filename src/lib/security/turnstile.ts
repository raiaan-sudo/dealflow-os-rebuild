import "server-only";

import { ApiError } from "@/lib/api/route";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const LEAD_CAPTURE_ACTION = "lead_capture";
const KNOWN_TEST_SECRET_PREFIXES = ["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA", "3x0000000000000000000000000000000AA"];

type TurnstileSiteverifyResponse = {
  success?: unknown;
  hostname?: unknown;
  action?: unknown;
  "error-codes"?: unknown;
};

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function normalizeHostname(value: string) {
  const candidate = value.trim().toLowerCase().replace(/\.$/, "");
  if (!candidate || candidate.includes("/") || candidate.includes(":")) {
    return null;
  }
  return candidate;
}

export function getTurnstileAllowedHostnames() {
  const configured = (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? "")
    .split(",")
    .map((value) => normalizeHostname(value))
    .filter((value): value is string => Boolean(value));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    try {
      configured.push(new URL(appUrl).hostname.toLowerCase());
    } catch {
      // Invalid application origins are rejected by the normal application
      // configuration checks; they are never accepted as Turnstile hosts.
    }
  }
  return Array.from(new Set(configured));
}

export function evaluateLeadCaptureTurnstileResponse(params: {
  response: TurnstileSiteverifyResponse;
  allowedHostnames: string[];
}) {
  const hostname =
    typeof params.response.hostname === "string"
      ? normalizeHostname(params.response.hostname)
      : null;
  return (
    params.response.success === true &&
    params.response.action === LEAD_CAPTURE_ACTION &&
    Boolean(hostname) &&
    params.allowedHostnames.includes(hostname!)
  );
}

export async function verifyLeadCaptureTurnstile(params: {
  token: string | null | undefined;
  remoteIp?: string | null;
  fetchImpl?: typeof fetch;
}) {
  if (!isProductionRuntime()) {
    return { required: false, verified: false as const };
  }

  const secret = process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  const allowedHostnames = getTurnstileAllowedHostnames();
  if (
    !secret ||
    KNOWN_TEST_SECRET_PREFIXES.includes(secret) ||
    allowedHostnames.length === 0
  ) {
    throw new ApiError(
      503,
      "Lead verification is not configured.",
      "lead_turnstile_configuration_missing",
    );
  }

  const token = params.token?.trim() ?? "";
  if (!token) {
    throw new ApiError(400, "Complete the verification challenge.", "lead_turnstile_required");
  }

  const body = new URLSearchParams({
    secret,
    response: token,
    idempotency_key: crypto.randomUUID(),
  });
  if (params.remoteIp && params.remoteIp !== "anonymous") {
    body.set("remoteip", params.remoteIp);
  }

  let response: Response;
  try {
    response = await (params.fetchImpl ?? fetch)(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      503,
      "Lead verification is temporarily unavailable.",
      "lead_turnstile_unavailable",
    );
  }

  const result = (await response.json().catch(() => null)) as TurnstileSiteverifyResponse | null;
  if (
    !response.ok ||
    !result ||
    !evaluateLeadCaptureTurnstileResponse({ response: result, allowedHostnames })
  ) {
    throw new ApiError(400, "Lead verification failed.", "lead_turnstile_invalid");
  }

  return { required: true, verified: true as const };
}
