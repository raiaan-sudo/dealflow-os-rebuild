import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import {
  buildRateLimitResponse,
  consumeRateLimit,
  getRateLimitKey,
} from "@/lib/api/rate-limit";
import { finalizeServerAuthResponse } from "@/lib/auth/server-auth-response";
import { assertExactAuthOrigin } from "@/lib/auth/server-origin";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const mutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("begin-enrollment"),
  }).strict(),
  z.object({
    action: z.literal("verify"),
    factorId: z.string().uuid(),
    code: z.string().regex(/^\d{6}$/),
  }).strict(),
]);

function createCookieSink() {
  return finalizeServerAuthResponse(NextResponse.json({ success: false }));
}

function withAuthCookies<T extends Record<string, unknown>>(
  payload: T,
  cookieSink: NextResponse,
) {
  return finalizeServerAuthResponse(NextResponse.json(payload), cookieSink);
}

async function requireMfaClient(cookieSink: NextResponse) {
  const supabase = await createServerSupabase(cookieSink);
  if (!supabase) {
    throw new ApiError(503, "Two-factor authentication is unavailable.", "mfa_unavailable");
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new ApiError(401, "Authentication is required.", "unauthorized");
  }

  return supabase;
}

async function enforceMfaRateLimit(request: Request) {
  const rateLimit = await consumeRateLimit({
    key: getRateLimitKey(request, "auth:mfa"),
    limit: 20,
    windowMs: 5 * 60_000,
  });
  return rateLimit && !rateLimit.allowed
    ? buildRateLimitResponse(rateLimit.resetAt)
    : null;
}

export async function GET(request: Request) {
  let cookieSink: NextResponse | null = null;
  try {
    assertExactAuthOrigin(request);
    const limited = await enforceMfaRateLimit(request);
    if (limited) return limited;
    cookieSink = createCookieSink();
    const supabase = await requireMfaClient(cookieSink);
    const [factors, assurance] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);

    if (factors.error || assurance.error) {
      throw new ApiError(503, "Two-factor authentication is unavailable.", "mfa_unavailable");
    }

    return withAuthCookies(
      {
        success: true,
        verifiedFactorId: factors.data.totp[0]?.id ?? null,
        assuranceLevel: assurance.data.currentLevel,
      },
      cookieSink,
    );
  } catch (error) {
    return finalizeServerAuthResponse(handleApiError(error, "MFA status"), cookieSink);
  }
}

export async function POST(request: Request) {
  let cookieSink: NextResponse | null = null;
  try {
    assertExactAuthOrigin(request);
    const limited = await enforceMfaRateLimit(request);
    if (limited) return limited;
    const body = await parseJsonBody(request, mutationSchema, {
      maxBytes: 4 * 1_024,
      code: "mfa_request_body_too_large",
    });
    cookieSink = createCookieSink();
    const supabase = await requireMfaClient(cookieSink);

    if (body.action === "begin-enrollment") {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) {
        throw new ApiError(503, "Two-factor authentication is unavailable.", "mfa_unavailable");
      }

      for (const factor of factors.data.all.filter(
        (item) => item.factor_type === "totp" && item.status === "unverified",
      )) {
        const cleanup = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (cleanup.error) {
          throw new ApiError(503, "Authenticator setup could not begin.", "mfa_enrollment_failed");
        }
      }

      const enrollment = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "DealFlow Authenticator",
      });
      if (enrollment.error || enrollment.data.type !== "totp") {
        throw new ApiError(503, "Authenticator setup could not begin.", "mfa_enrollment_failed");
      }

      return withAuthCookies(
        {
          success: true,
          factorId: enrollment.data.id,
          qrCode: enrollment.data.totp.qr_code,
        },
        cookieSink,
      );
    }

    const verification = await supabase.auth.mfa.challengeAndVerify({
      factorId: body.factorId,
      code: body.code,
    });
    if (verification.error) {
      throw new ApiError(400, "Authenticator code was not accepted.", "mfa_code_invalid");
    }

    return withAuthCookies({ success: true }, cookieSink);
  } catch (error) {
    return finalizeServerAuthResponse(handleApiError(error, "MFA mutation"), cookieSink);
  }
}
