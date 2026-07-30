import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import {
  buildRateLimitResponse,
  consumeRateLimitBuckets,
  getHashedRateLimitIdentifier,
  getRateLimitKey,
} from "@/lib/api/rate-limit";
import { finalizeServerAuthResponse } from "@/lib/auth/server-auth-response";
import { assertExactAuthOrigin } from "@/lib/auth/server-origin";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const callbackUrlSchema = z.string().url().max(2_048);
const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(1).max(1_024);
const captchaTokenSchema = z.string().min(1).max(4_096).optional();

const authRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sign-in"),
    email: emailSchema,
    password: passwordSchema,
    captchaToken: captchaTokenSchema,
  }).strict(),
  z.object({
    action: z.literal("sign-up"),
    email: emailSchema,
    password: passwordSchema,
    fullName: z.string().trim().max(160),
    captchaToken: captchaTokenSchema,
    redirectTo: callbackUrlSchema,
    partnerAttributionToken: z.string().min(1).max(4_096).optional(),
    accessKeyClaimToken: z.string().min(1).max(4_096).optional(),
    accessKeyPartnerSlug: z.string().trim().min(1).max(80).optional(),
  }).strict(),
  z.object({
    action: z.literal("request-password-reset"),
    email: emailSchema,
    captchaToken: captchaTokenSchema,
    redirectTo: callbackUrlSchema,
  }).strict(),
  z.object({
    action: z.literal("update-password"),
    password: passwordSchema,
  }).strict(),
  z.object({
    action: z.literal("oauth"),
    provider: z.literal("google"),
    redirectTo: callbackUrlSchema,
  }).strict(),
]);

type AuthAction = z.infer<typeof authRequestSchema>["action"] | "sign-out";

const AUTH_RATE_LIMITS: Record<AuthAction, { limit: number; windowMs: number }> = {
  "sign-in": { limit: 12, windowMs: 60_000 },
  "sign-up": { limit: 6, windowMs: 10 * 60_000 },
  "request-password-reset": { limit: 4, windowMs: 15 * 60_000 },
  "update-password": { limit: 6, windowMs: 10 * 60_000 },
  oauth: { limit: 12, windowMs: 60_000 },
  "sign-out": { limit: 30, windowMs: 60_000 },
};

function requireExactCallbackUrl(
  request: Request,
  redirectTo: string,
  expectedFlow: "oauth" | "signup" | "recovery",
) {
  const callback = new URL(redirectTo);
  const requestOrigin = new URL(request.url).origin;

  if (
    callback.origin !== requestOrigin ||
    callback.pathname !== "/auth/callback" ||
    callback.searchParams.get("flow") !== expectedFlow
  ) {
    throw new ApiError(400, "Authentication callback is invalid.", "auth_callback_invalid");
  }

  return callback.toString();
}

async function enforceAuthRateLimit(
  request: Request,
  action: AuthAction,
  email?: string,
) {
  const policy = AUTH_RATE_LIMITS[action];
  const buckets = [
    {
      key: getRateLimitKey(request, `auth:${action}:ip`),
      limit: policy.limit,
      windowMs: policy.windowMs,
    },
  ];

  if (email) {
    buckets.push({
      key: `auth:${action}:identity:${getHashedRateLimitIdentifier(email)}`,
      limit: policy.limit,
      windowMs: policy.windowMs,
    });
  }

  const result = await consumeRateLimitBuckets(buckets);
  return result && !result.allowed ? buildRateLimitResponse(result.resetAt) : null;
}

function createCookieSink() {
  return finalizeServerAuthResponse(NextResponse.json({ success: false }));
}

function withAuthCookies<T extends Record<string, unknown>>(
  payload: T,
  cookieSink: NextResponse,
  init?: ResponseInit,
) {
  return finalizeServerAuthResponse(NextResponse.json(payload, init), cookieSink);
}

function authRejected(status = 401, code = "auth_rejected"): never {
  throw new ApiError(status, "Authentication request was not accepted.", code);
}

export async function POST(request: Request) {
  let cookieSink: NextResponse | null = null;
  let preserveExistingSessionWrites = false;
  try {
    assertExactAuthOrigin(request);
    const body = await parseJsonBody(request, authRequestSchema, {
      maxBytes: 16 * 1_024,
      code: "auth_request_body_too_large",
    });
    const limited = await enforceAuthRateLimit(
      request,
      body.action,
      "email" in body ? body.email : undefined,
    );
    if (limited) return limited;

    preserveExistingSessionWrites = body.action === "update-password";
    cookieSink = createCookieSink();
    const supabase = await createServerSupabase(cookieSink);
    if (!supabase) {
      throw new ApiError(503, "Authentication is unavailable.", "auth_unavailable");
    }

    if (body.action === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({
        email: body.email,
        password: body.password,
        options: {
          captchaToken: body.captchaToken,
        },
      });
      if (error) authRejected();

      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error) {
        authRejected(503, "auth_assurance_unavailable");
      }

      return withAuthCookies(
        {
          success: true,
          requiresMfa:
            assurance.data.nextLevel === "aal2" &&
            assurance.data.currentLevel !== "aal2",
        },
        cookieSink,
      );
    }

    if (body.action === "sign-up") {
      const redirectTo = requireExactCallbackUrl(request, body.redirectTo, "signup");
      const { data, error } = await supabase.auth.signUp({
        email: body.email,
        password: body.password,
        options: {
          captchaToken: body.captchaToken,
          emailRedirectTo: redirectTo,
          data: {
            full_name: body.fullName,
            ...(body.partnerAttributionToken
              ? { partner_attribution_token: body.partnerAttributionToken }
              : {}),
            ...(body.accessKeyClaimToken
              ? { access_key_claim_token: body.accessKeyClaimToken }
              : {}),
            ...(body.accessKeyPartnerSlug
              ? { access_key_partner_slug: body.accessKeyPartnerSlug }
              : {}),
          },
        },
      });
      if (error) authRejected(400, "signup_rejected");

      return withAuthCookies(
        {
          success: true,
          sessionEstablished: Boolean(data.session),
        },
        cookieSink,
      );
    }

    if (body.action === "request-password-reset") {
      const redirectTo = requireExactCallbackUrl(request, body.redirectTo, "recovery");
      const { error } = await supabase.auth.resetPasswordForEmail(body.email, {
        redirectTo,
        captchaToken: body.captchaToken,
      });
      if (error) authRejected(400, "password_reset_rejected");

      return withAuthCookies({ success: true }, cookieSink);
    }

    if (body.action === "update-password") {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) authRejected();

      const { error } = await supabase.auth.updateUser({ password: body.password });
      if (error) authRejected(400, "password_update_rejected");

      return withAuthCookies({ success: true }, cookieSink);
    }

    if (process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH !== "true") {
      throw new ApiError(404, "Authentication provider is unavailable.", "oauth_disabled");
    }

    const redirectTo = requireExactCallbackUrl(request, body.redirectTo, "oauth");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: body.provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url) authRejected(400, "oauth_rejected");

    return withAuthCookies({ success: true, redirectUrl: data.url }, cookieSink);
  } catch (error) {
    return finalizeServerAuthResponse(
      handleApiError(error, "Server-only authentication"),
      preserveExistingSessionWrites ? cookieSink : null,
    );
  }
}

export async function DELETE(request: Request) {
  let cookieSink: NextResponse | null = null;
  try {
    assertExactAuthOrigin(request);
    const limited = await enforceAuthRateLimit(request, "sign-out");
    if (limited) return limited;

    cookieSink = createCookieSink();
    const supabase = await createServerSupabase(cookieSink);
    if (!supabase) {
      throw new ApiError(503, "Authentication is unavailable.", "auth_unavailable");
    }

    const { error } = await supabase.auth.signOut();
    if (error) authRejected(503, "signout_failed");

    return withAuthCookies({ success: true }, cookieSink);
  } catch (error) {
    return finalizeServerAuthResponse(
      handleApiError(error, "Server-only sign out"),
      cookieSink,
    );
  }
}
