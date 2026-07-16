import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  ApiError,
  assertInternalSystemRequest,
  handleApiError,
} from "@/lib/api/route";
import {
  getServiceRoleEnv,
  getSupabaseEnvOrThrow,
  isInternalAdminEmail,
} from "@/lib/env";
import {
  getDeploymentTarget,
  isExplicitNonProductionDeployment,
} from "@/lib/deployment-target";
import { getSupabaseAuthCookieOptions } from "@/lib/supabase/cookie-options";
import { isExactIsolatedSupabaseProject } from "@/lib/security/supabase-isolation";
import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function assertQaHarnessEnabled() {
  if (getDeploymentTarget() === "production") {
    throw new ApiError(
      404,
      "QA auth harness is not available in production artifacts.",
      "qa_auth_harness_production_disabled",
    );
  }

  if (!isExplicitNonProductionDeployment()) {
    throw new ApiError(
      404,
      "QA auth harness requires an explicitly attested nonproduction target.",
      "qa_auth_harness_target_unattested",
    );
  }

  if (process.env.QA_AUTH_HARNESS_ENABLED !== "true") {
    throw new ApiError(404, "QA auth harness is not enabled.", "qa_auth_harness_disabled");
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

const ELEVATED_ORGANIZATION_ROLES = new Set([
  "owner",
  "admin",
  "owner_admin",
  "operator",
  "platform_admin",
  "internal_admin",
]);

function assertQaIsolatedSupabaseProject(supabaseUrl: string) {
  if (
    !isExactIsolatedSupabaseProject({
      supabaseUrl,
      expectedProjectRef: process.env.QA_ISOLATED_SUPABASE_PROJECT_REF,
    })
  ) {
    throw new ApiError(
      404,
      "QA auth harness is not authorized for this Supabase project.",
      "qa_auth_harness_project_not_isolated",
    );
  }
}

async function assertQaUserIsNonAdmin(
  admin: ReturnType<typeof createClient<Database>>,
  qaEmail: string,
) {
  if (isInternalAdminEmail(qaEmail)) {
    throw new ApiError(403, "QA auth harness requires a non-admin QA user.", "qa_email_internal_admin");
  }

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id,email,partner_id")
    .eq("email", qaEmail)
    .maybeSingle();

  if (profileError) {
    throw new ApiError(500, profileError.message, "qa_user_profile_lookup_failed");
  }

  const qaProfile = profile as {
    id?: string | null;
    email?: string | null;
    partner_id?: string | null;
  } | null;

  if (!qaProfile?.id || qaProfile.email?.toLowerCase() !== qaEmail) {
    throw new ApiError(403, "QA auth harness requires an existing non-admin QA user profile.", "qa_user_profile_missing");
  }

  if (qaProfile.partner_id) {
    throw new ApiError(
      403,
      "QA auth harness rejects partner-bound users.",
      "qa_user_partner_binding_rejected",
    );
  }

  const userId = String(qaProfile.id);
  const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(userId);
  const authUser = authUserData?.user;

  if (
    authUserError ||
    !authUser ||
    authUser.id !== userId ||
    authUser.email?.trim().toLowerCase() !== qaEmail
  ) {
    throw new ApiError(
      403,
      "QA auth harness requires an existing matching auth user.",
      "qa_auth_user_missing",
    );
  }

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

  const { data: ownedOrganizations, error: ownedOrganizationsError } = await admin
    .from("organizations")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1);

  if (ownedOrganizationsError) {
    throw new ApiError(500, ownedOrganizationsError.message, "qa_owned_organization_lookup_failed");
  }

  if (Array.isArray(ownedOrganizations) && ownedOrganizations.length > 0) {
    throw new ApiError(
      403,
      "QA auth harness rejects canonical organization owners.",
      "qa_user_organization_owner_rejected",
    );
  }

  return { userId };
}

export async function POST(request: Request) {
  try {
    assertInternalSystemRequest(request);
    assertQaHarnessEnabled();

    const qaEmail = getQaEmail();
    const serviceRoleEnv = getServiceRoleEnv();
    const supabaseEnv = getSupabaseEnvOrThrow();

    assertQaIsolatedSupabaseProject(supabaseEnv.url);

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

    const { data: sessionData, error: verifyError } = await anon.auth.verifyOtp({
      type: "email",
      token_hash: tokenHash,
    });

    if (verifyError) {
      throw new ApiError(
        500,
        "QA session token verification failed without mutating the QA user's credentials.",
        "qa_session_token_verify_failed",
      );
    }

    const session = sessionData.session;
    const user = sessionData.user;

    if (
      !session?.access_token ||
      !session.refresh_token ||
      user?.email?.toLowerCase() !== qaEmail ||
      user.id !== qaUser.userId
    ) {
      throw new ApiError(500, "QA session could not be established.", "qa_session_missing");
    }

    const cookieMap = new Map<string, string>();
    const authCookieOptions = getSupabaseAuthCookieOptions();
    const ssr = createServerClient<Database>(supabaseEnv.url, supabaseEnv.anonKey, {
      cookieOptions: authCookieOptions,
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
      const sameSite = authCookieOptions.sameSite === "none" ? "None" : "Lax";
      const secure = authCookieOptions.secure ? "; Secure" : "";
      response.headers.append(
        "Set-Cookie",
        `${name}=${value}; Path=/; Max-Age=${2 * 60 * 60}; HttpOnly; SameSite=${sameSite}${secure}`,
      );
    }

    return response;
  } catch (error) {
    return handleApiError(error, "Internal QA auth session harness");
  }
}
