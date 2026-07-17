import "server-only";

import { isExactIsolatedStagingVercelHost } from "@/lib/deployment-target";
import { readPlatformAdminAuthority } from "@/lib/authority/owner-decision-authority";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

export type PlatformOperatorAction =
  | "admin:read"
  | "operations:write"
  | "security:read"
  | "security:write"
  | "access_keys:revoke"
  | "platform_grants:manage";

export type PlatformOperatorRole =
  | "viewer"
  | "operator"
  | "security_admin"
  | "break_glass";

export type PlatformOperatorAccessReceipt = Readonly<{
  receiptId: string;
  receiptDigest: string;
  role: PlatformOperatorRole;
  grantGeneration: number;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_64 = /^[0-9a-f]{64}$/;
const ROLES = new Set<PlatformOperatorRole>([
  "viewer",
  "operator",
  "security_admin",
  "break_glass",
]);

function runtimeEnvironment(
  authorityMode: "production" | "synthetic_staging",
): "production" | "staging" | null {
  if (authorityMode === "synthetic_staging") {
    return isExactIsolatedStagingVercelHost(process.env) ? "staging" : null;
  }
  return process.env.VERCEL_ENV === "production" &&
    process.env.DEALFLOW_DEPLOYMENT_TARGET === "production" &&
    Boolean(process.env.VERCEL_PROJECT_ID?.trim()) ? "production" : null;
}

async function readRecentAal2Session(expectedUserId: string) {
  try {
    const client = await createRouteHandlerClient();
    if (!client) return null;
    const [{ data: assurance, error: assuranceError }, { data: claimsData, error: claimsError }] =
      await Promise.all([
        client.auth.mfa.getAuthenticatorAssuranceLevel(),
        client.auth.getClaims(),
      ]);
    const claims = claimsData?.claims as Record<string, unknown> | undefined;
    const subject = typeof claims?.sub === "string" ? claims.sub : "";
    const claimsAssurance = typeof claims?.aal === "string" ? claims.aal : "";
    const issuedAt = typeof claims?.iat === "number" ? claims.iat : Number(claims?.iat);
    const ageSeconds = Date.now() / 1_000 - issuedAt;
    if (
      assuranceError || claimsError || assurance?.currentLevel !== "aal2" ||
      claimsAssurance !== "aal2" ||
      subject !== expectedUserId || !Number.isFinite(issuedAt) ||
      ageSeconds < -30 || ageSeconds > 10 * 60
    ) return null;
    return new Date(issuedAt * 1_000).toISOString();
  } catch {
    return null;
  }
}

async function readAuthorizedRuntime() {
  const authority = await readPlatformAdminAuthority();
  const environment = authority.authorized
    ? runtimeEnvironment(authority.authorityMode)
    : null;
  if (!authority.authorized || !environment) return null;
  return { authority, environment };
}

function authorityInputs(
  runtime: NonNullable<Awaited<ReturnType<typeof readAuthorizedRuntime>>>,
  userId: string,
  sessionIssuedAt: string,
) {
  return {
    rpc: {
      p_user_id: userId,
      p_environment: runtime.environment,
      p_session_issued_at: sessionIssuedAt,
      p_assurance_level: runtime.authority.policy.requiredAssuranceLevel,
      p_candidate_commit: runtime.authority.candidateIdentity.commit,
      p_candidate_tree: runtime.authority.candidateIdentity.tree,
      p_candidate_digest: runtime.authority.candidateIdentity.trackedWorktreeSha256,
      p_authority_packet_digest: runtime.authority.packetDigest,
      p_signed_authority_ref: runtime.authority.signatureReference,
    },
  };
}

export async function canExposePlatformOperatorNavigation(userId: string) {
  const runtime = await readAuthorizedRuntime();
  if (!runtime) return false;
  const sessionIssuedAt = await readRecentAal2Session(userId);
  if (!sessionIssuedAt) return false;
  const inputs = authorityInputs(runtime, userId, sessionIssuedAt);
  try {
    const admin = createAdminClient();
    if (!admin) return false;
    const { data, error } = await (admin as any).rpc(
      "check_platform_operator_navigation_v1",
      inputs.rpc,
    );
    if (error) return false;
    const row = Array.isArray(data) ? data[0] : data;
    return Boolean(
      row && ROLES.has(row.operator_role as PlatformOperatorRole) &&
      Number.isSafeInteger(Number(row.grant_generation)) && Number(row.grant_generation) > 0,
    );
  } catch {
    return false;
  }
}

export async function authorizePlatformOperatorAccess(params: {
  userId: string;
  requiredAction: PlatformOperatorAction;
}): Promise<PlatformOperatorAccessReceipt | null> {
  const runtime = await readAuthorizedRuntime();
  if (!runtime) return null;
  const sessionIssuedAt = await readRecentAal2Session(params.userId);
  if (!sessionIssuedAt) return null;
  const inputs = authorityInputs(runtime, params.userId, sessionIssuedAt);
  try {
    const admin = createAdminClient();
    if (!admin) return null;
    const { data, error } = await (admin as any).rpc(
      "authorize_platform_operator_access_v1",
      { ...inputs.rpc, p_required_action: params.requiredAction },
    );
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    const role = row?.operator_role as PlatformOperatorRole | undefined;
    const grantGeneration = Number(row?.grant_generation);
    if (
      !row || !role || !ROLES.has(role) ||
      !UUID_PATTERN.test(String(row.receipt_id ?? "")) ||
      !HEX_64.test(String(row.receipt_digest ?? "")) ||
      !Number.isSafeInteger(grantGeneration) || grantGeneration <= 0
    ) return null;
    return Object.freeze({
      receiptId: String(row.receipt_id),
      receiptDigest: String(row.receipt_digest),
      role,
      grantGeneration,
    });
  } catch {
    return null;
  }
}
