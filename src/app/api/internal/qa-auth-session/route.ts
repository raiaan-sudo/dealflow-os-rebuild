import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import {
  ApiError,
  handleApiError,
} from "@/lib/api/route";
import {
  getInternalSystemJobSecrets,
  getServiceRoleEnv,
  getSupabaseEnvOrThrow,
  isInternalAdminEmail,
} from "@/lib/env";
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

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
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

function getQaAuthHarnessSecrets() {
  return Array.from(
    new Set(
      [
        process.env.QA_AUTH_PROOF_SECRET,
        ...getInternalSystemJobSecrets(),
      ]
        .map((value) => value?.trim() ?? "")
        .filter(Boolean),
    ),
  );
}

function assertQaAuthHarnessRequest(request: Request) {
  const secrets = getQaAuthHarnessSecrets();

  if (secrets.length === 0) {
    throw new ApiError(503, "QA auth harness secret is not configured.", "qa_auth_secret_missing");
  }

  const token = getBearerToken(request) ?? request.headers.get("x-internal-system-key")?.trim() ?? null;

  if (!secrets.some((secret) => timingSafeTokenEquals(token, secret))) {
    throw new ApiError(401, "QA auth harness authorization is required.", "qa_auth_unauthorized");
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

function createTemporaryQaPassword() {
  return `Df-${randomBytes(36).toString("base64url")}!1`;
}

const ELEVATED_ORGANIZATION_ROLES = new Set([
  "admin",
  "owner_admin",
  "operator",
  "platform_admin",
  "internal_admin",
]);

async function assertQaUserIsNonAdmin(
  admin: ReturnType<typeof createClient<Database>>,
  qaEmail: string,
) {
  if (isInternalAdminEmail(qaEmail)) {
    throw new ApiError(403, "QA auth harness requires a non-admin QA user.", "qa_email_internal_admin");
  }

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id,email")
    .eq("email", qaEmail)
    .maybeSingle();

  if (profileError) {
    throw new ApiError(500, profileError.message, "qa_user_profile_lookup_failed");
  }

  const qaProfile = profile as { id?: string | null; email?: string | null } | null;

  if (!qaProfile?.id || qaProfile.email?.toLowerCase() !== qaEmail) {
    throw new ApiError(403, "QA auth harness requires an existing non-admin QA user profile.", "qa_user_profile_missing");
  }

  const userId = String(qaProfile.id);

  const { data: partnerMemberships, error: partnerMembershipError } = await admin
    .from("partner_memberships")
    .select("partner_id,role,status")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);

  if (partnerMembershipError) {
    throw new ApiError(500, partnerMembershipError.message, "qa_partner_membership_lookup_failed");
  }

  if (Array.isArray(partnerMemberships) && partnerMemberships.length > 0) {
    throw new ApiError(403, "QA auth harness rejects partner-admin/operator capable users.", "qa_user_partner_membership_rejected");
  }

  const { data: organizationMemberships, error: organizationMembershipError } = await admin
    .from("organization_memberships")
    .select("role")
    .eq("user_id", userId)
    .limit(20);

  if (organizationMembershipError) {
    throw new ApiError(500, organizationMembershipError.message, "qa_organization_membership_lookup_failed");
  }

  const elevatedRole = (Array.isArray(organizationMemberships) ? organizationMemberships : [])
    .map((membership: { role?: unknown }) => String(membership.role ?? "").trim().toLowerCase())
    .find((role) => ELEVATED_ORGANIZATION_ROLES.has(role));

  if (elevatedRole) {
    throw new ApiError(403, "QA auth harness rejects elevated organization users.", "qa_user_elevated_membership_rejected");
  }

  return { userId };
}

export async function POST(request: Request) {
  try {
    assertQaAuthHarnessRequest(request);
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

    const qaUser = await assertQaUserIsNonAdmin(admin, qaEmail);

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

    let { data: sessionData, error: verifyError } = await anon.auth.verifyOtp({
      type: "email",
      token_hash: tokenHash,
    });

    if (verifyError) {
      const userId = linkData.user?.id;

      if (!userId) {
        throw new ApiError(500, "QA session could not identify the test user.", "qa_session_user_missing");
      }

      const temporaryPassword = createTemporaryQaPassword();
      const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
        password: temporaryPassword,
        email_confirm: true,
      });

      if (updateError) {
        throw new ApiError(500, updateError.message, "qa_session_password_prepare_failed");
      }

      const passwordSession = await anon.auth.signInWithPassword({
        email: qaEmail,
        password: temporaryPassword,
      });

      if (passwordSession.error) {
        throw new ApiError(500, passwordSession.error.message, "qa_session_password_verify_failed");
      }

      sessionData = passwordSession.data;
      verifyError = null;
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
        userId: qaUser.userId,
        email: redactEmail(qaEmail),
        cookieCount: cookieMap.size,
        access: "non_admin_qa",
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
