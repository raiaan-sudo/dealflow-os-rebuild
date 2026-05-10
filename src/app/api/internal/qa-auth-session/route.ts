import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  ApiError,
  assertInternalSystemRequest,
  handleApiError,
} from "@/lib/api/route";
import { getServiceRoleEnv, getSupabaseEnvOrThrow } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function assertQaHarnessEnabled() {
  if (process.env.QA_AUTH_HARNESS_ENABLED !== "true") {
    throw new ApiError(404, "QA auth harness is not enabled.", "qa_auth_harness_disabled");
  }

  if (
    process.env.VERCEL_ENV === "production" &&
    process.env.QA_AUTH_HARNESS_PRODUCTION_ENABLED !== "true"
  ) {
    throw new ApiError(404, "QA auth harness is not enabled in production.", "qa_auth_harness_production_disabled");
  }
}

function getQaEmail() {
  const qaEmail = process.env.QA_EMAIL?.trim().toLowerCase();

  if (!qaEmail) {
    throw new ApiError(503, "QA email is not configured.", "qa_email_missing");
  }

  return qaEmail;
}

function redactEmail(email: string) {
  const [name, domain] = email.split("@");

  if (!name || !domain) {
    return "[REDACTED]";
  }

  return `${name.slice(0, 2)}***@${domain}`;
}

export async function POST(request: Request) {
  try {
    assertInternalSystemRequest(request);
    assertQaHarnessEnabled();

    const qaEmail = getQaEmail();
    const serviceRoleEnv = getServiceRoleEnv();
    const supabaseEnv = getSupabaseEnvOrThrow();

    if (!serviceRoleEnv) {
      throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
    }

    const admin = createClient<Database>(serviceRoleEnv.url, serviceRoleEnv.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const anon = createClient<Database>(supabaseEnv.url, supabaseEnv.anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: qaEmail,
    });

    if (linkError) {
      throw new ApiError(500, linkError.message, "qa_session_link_failed");
    }

    const tokenHash = linkData.properties?.hashed_token;

    if (!tokenHash) {
      throw new ApiError(500, "Supabase did not return a token hash.", "qa_session_token_missing");
    }

    const { data: sessionData, error: verifyError } = await anon.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });

    if (verifyError) {
      throw new ApiError(500, verifyError.message, "qa_session_verify_failed");
    }

    const session = sessionData.session;
    const user = sessionData.user;

    if (!session?.access_token || !session.refresh_token || user?.email?.toLowerCase() !== qaEmail) {
      throw new ApiError(500, "QA session could not be established.", "qa_session_missing");
    }

    const cookieMap = new Map<string, string>();
    const ssr = createServerClient<Database>(supabaseEnv.url, supabaseEnv.anonKey, {
      cookies: {
        get(name) {
          return cookieMap.get(name);
        },
        set(name, value) {
          cookieMap.set(name, value);
        },
        remove(name) {
          cookieMap.delete(name);
        },
      },
    });
    const { error: setSessionError } = await ssr.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    if (setSessionError) {
      throw new ApiError(500, setSessionError.message, "qa_session_cookie_failed");
    }

    const response = Response.json(
      {
        success: true,
        userId: user.id,
        email: redactEmail(qaEmail),
        cookieCount: cookieMap.size,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
        },
      },
    );

    for (const [name, value] of cookieMap) {
      response.headers.append(
        "Set-Cookie",
        `${name}=${value}; Path=/; Max-Age=${2 * 60 * 60}; SameSite=Lax; Secure`,
      );
    }

    return response;
  } catch (error) {
    return handleApiError(error, "Internal QA auth session harness");
  }
}
