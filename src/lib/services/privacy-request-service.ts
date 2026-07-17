import "server-only";

import { ApiError } from "@/lib/api/route";
import { getAppContext } from "@/lib/services/app-context";
import {
  authorizePrivacySubjectAction,
  privacyDigest,
  type PrivacySubjectAction,
} from "@/lib/services/privacy-authority-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

export type PrivacyRequestType = Exclude<PrivacySubjectAction, "consent" | "delete">;

type PrivacyRequestRow = Readonly<{
  id: string;
  request_type: PrivacyRequestType;
  state: "accepted" | "in_progress" | "completed" | "rejected" | "expired";
  accepted_at: string;
  expires_at: string;
  completed_at: string | null;
  updated_at: string;
}>;

function publicRequest(row: PrivacyRequestRow) {
  return Object.freeze({
    id: row.id,
    requestType: row.request_type,
    state: row.state,
    acceptedAt: row.accepted_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  });
}

async function listCurrentPrivacyRequests(userId: string, organizationId: string) {
  const client = await createRouteHandlerClient();
  if (!client) return [];
  const { data, error } = await (client as any)
    .from("privacy_subject_requests")
    .select("id,request_type,state,accepted_at,expires_at,completed_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("requested_by_user_id", userId)
    .in("request_type", ["access", "correction", "export"])
    .order("accepted_at", { ascending: false })
    .limit(20);
  if (error || !Array.isArray(data)) return [];
  return data.map((entry) => publicRequest(entry as PrivacyRequestRow));
}

export async function getPrivacyRequestOverview() {
  const context = await getAppContext();
  if (!context) throw new ApiError(401, "Authentication is required.", "unauthorized");
  const [requests, access, correction, exportAuthority] = await Promise.all([
    listCurrentPrivacyRequests(context.user.id, context.organization.id),
    authorizePrivacySubjectAction({ organizationId: context.organization.id, userId: context.user.id, action: "access" }),
    authorizePrivacySubjectAction({ organizationId: context.organization.id, userId: context.user.id, action: "correction" }),
    authorizePrivacySubjectAction({ organizationId: context.organization.id, userId: context.user.id, action: "export" }),
  ]);
  return Object.freeze({
    available: Boolean(access && correction && exportAuthority),
    recentAal2Required: true,
    requests,
  });
}

export async function createPrivacyRequest(input: {
  requestType: PrivacyRequestType;
  idempotencyKey: string;
  correctionDetails?: string;
}) {
  const context = await getAppContext();
  if (!context) throw new ApiError(401, "Authentication is required.", "unauthorized");
  if (context.organization.owner_user_id !== context.user.id) {
    throw new ApiError(403, "Only the workspace owner can submit this request.", "privacy_owner_required");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{15,127}$/.test(input.idempotencyKey)) {
    throw new ApiError(400, "A valid request key is required.", "privacy_idempotency_invalid");
  }
  const normalizedCorrection = input.correctionDetails?.trim().replace(/\s+/g, " ") ?? "";
  if (input.requestType === "correction" && (normalizedCorrection.length < 3 || normalizedCorrection.length > 2_000)) {
    throw new ApiError(400, "Correction details are required.", "privacy_correction_invalid");
  }
  if (input.requestType !== "correction" && normalizedCorrection.length > 0) {
    throw new ApiError(400, "Correction details are not valid for this request.", "privacy_payload_invalid");
  }
  const authority = await authorizePrivacySubjectAction({
    organizationId: context.organization.id,
    userId: context.user.id,
    action: input.requestType,
  });
  if (!authority) {
    throw new ApiError(
      503,
      "Verified privacy request authority and a recent two-factor session are required.",
      "privacy_request_authority_unavailable",
    );
  }
  const payloadDigest = privacyDigest(JSON.stringify({
    requestType: input.requestType,
    correctionDigest: normalizedCorrection ? privacyDigest(normalizedCorrection) : null,
  }));
  const evidenceDigest = privacyDigest(JSON.stringify({
    organizationId: context.organization.id,
    userId: context.user.id,
    idempotencyKey: input.idempotencyKey,
    payloadDigest,
  }));
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "Privacy requests are unavailable.", "privacy_store_unavailable");
  const { data, error } = await (admin as any).rpc("create_privacy_subject_request_v1", {
    p_organization_id: context.organization.id,
    p_actor_user_id: context.user.id,
    p_request_type: input.requestType,
    p_idempotency_key: input.idempotencyKey,
    p_request_payload_digest: payloadDigest,
    p_evidence_digest: evidenceDigest,
    ...authority.rpc,
  });
  const row = (Array.isArray(data) ? data[0] : data) as PrivacyRequestRow | null;
  if (error || !row?.id) {
    throw new ApiError(503, "Privacy request could not be recorded.", "privacy_request_failed");
  }
  return publicRequest(row);
}
