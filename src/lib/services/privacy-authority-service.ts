import "server-only";

import { createHash } from "node:crypto";
import { readPrivacyAuthority } from "@/lib/authority/owner-decision-authority";
import { isExactIsolatedStagingVercelHost } from "@/lib/deployment-target";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

export type PrivacySubjectAction =
  | "consent"
  | "access"
  | "correction"
  | "export"
  | "delete";

type PrivacyRpcAuthority = Readonly<{
  p_environment: "production" | "staging";
  p_candidate_commit: string;
  p_candidate_tree: string;
  p_candidate_digest: string;
  p_authority_packet_digest: string;
  p_signature_bundle_digest: string;
  p_policy_version: string;
  p_policy_digest: string;
}>;

export type PrivacyInteractiveAuthority = Readonly<{
  rpc: PrivacyRpcAuthority & Readonly<{
    p_assurance_level: "aal2";
    p_session_issued_at: string;
  }>;
  policy: Readonly<{
    allowedPurposes: readonly string[];
    requestTypes: readonly ["access", "correction", "export", "delete"];
  }>;
}>;

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

export function privacyDigest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function readRuntimeAuthority() {
  const authority = await readPrivacyAuthority();
  const environment = authority.authorized
    ? runtimeEnvironment(authority.authorityMode)
    : null;
  if (!authority.authorized || !environment) return null;
  if (environment === "production" && authority.authorityMode !== "production") return null;
  const signatureBundleDigest = privacyDigest(JSON.stringify(
    authority.decisionIds.map((decisionId, index) => ({
      decisionId,
      signatureReference: authority.signatureReferences[index] ?? "",
    })).sort((left, right) => left.decisionId.localeCompare(right.decisionId)),
  ));
  return Object.freeze({ authority, environment, signatureBundleDigest });
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
    const claimsAal = typeof claims?.aal === "string" ? claims.aal : "";
    const issuedAt = typeof claims?.iat === "number" ? claims.iat : Number(claims?.iat);
    const ageSeconds = Date.now() / 1_000 - issuedAt;
    if (
      assuranceError || claimsError || assurance?.currentLevel !== "aal2" ||
      claimsAal !== "aal2" || subject !== expectedUserId ||
      !Number.isFinite(issuedAt) || ageSeconds < -30 || ageSeconds > 10 * 60
    ) return null;
    return new Date(issuedAt * 1_000).toISOString();
  } catch {
    return null;
  }
}

function baseRpc(
  runtime: NonNullable<Awaited<ReturnType<typeof readRuntimeAuthority>>>,
): PrivacyRpcAuthority {
  return Object.freeze({
    p_environment: runtime.environment,
    p_candidate_commit: runtime.authority.candidateIdentity.commit,
    p_candidate_tree: runtime.authority.candidateIdentity.tree,
    p_candidate_digest: runtime.authority.candidateIdentity.trackedWorktreeSha256,
    p_authority_packet_digest: runtime.authority.packetDigest,
    p_signature_bundle_digest: runtime.signatureBundleDigest,
    p_policy_version: runtime.authority.policy.policyVersion,
    p_policy_digest: runtime.authority.policy.policyDigest,
  });
}

export async function authorizePrivacySubjectAction(params: {
  organizationId: string;
  userId: string;
  action: PrivacySubjectAction;
}): Promise<PrivacyInteractiveAuthority | null> {
  const runtime = await readRuntimeAuthority();
  if (!runtime || !runtime.authority.policy.requestTypes.includes(
    params.action as "access" | "correction" | "export" | "delete",
  ) && params.action !== "consent") return null;
  const sessionIssuedAt = await readRecentAal2Session(params.userId);
  if (!sessionIssuedAt) return null;
  const rpc = Object.freeze({
    ...baseRpc(runtime),
    p_assurance_level: "aal2" as const,
    p_session_issued_at: sessionIssuedAt,
  });
  try {
    const admin = createAdminClient();
    if (!admin) return null;
    const { data, error } = await (admin as any).rpc(
      "check_privacy_subject_authority_v1",
      {
        p_organization_id: params.organizationId,
        p_actor_user_id: params.userId,
        p_action: params.action,
        ...rpc,
      },
    );
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.grant_id || row.authority_action !== params.action ||
      row.policy_version !== runtime.authority.policy.policyVersion) return null;
    return Object.freeze({
      rpc,
      policy: Object.freeze({
        allowedPurposes: runtime.authority.policy.allowedPurposes,
        requestTypes: runtime.authority.policy.requestTypes,
      }),
    });
  } catch {
    return null;
  }
}

export async function readPrivacySystemAuthority(): Promise<Readonly<{ rpc: PrivacyRpcAuthority }> | null> {
  const runtime = await readRuntimeAuthority();
  if (!runtime) return null;
  return Object.freeze({ rpc: baseRpc(runtime) });
}
