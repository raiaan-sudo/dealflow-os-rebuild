import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import { createAdminClient } from "@/lib/server/supabase-admin";

export const META_DELETION_MAX_AGE_SECONDS = 24 * 60 * 60;
export const META_DELETION_FUTURE_SKEW_SECONDS = 5 * 60;

type MetaDeletionClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type MetaDeletionStatusClient = {
  from: (relation: string) => any;
};

type AcceptedDeletionRow = {
  id?: unknown;
  confirmation_code?: unknown;
  responsibility_status?: unknown;
  replayed?: unknown;
};

const META_DELETION_RESPONSIBILITY_STATUSES = new Set([
  "operator_required",
  "in_progress",
  "completed",
  "rejected",
]);

export function validateMetaDeletionIssuedAt(
  issuedAt: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (issuedAt === undefined || issuedAt === null) {
    return "missing" as const;
  }

  if (!Number.isSafeInteger(issuedAt) || Number(issuedAt) <= 0) {
    throw new ApiError(
      400,
      "Signed request issued_at is invalid.",
      "invalid_signed_request_issued_at",
    );
  }

  const issuedAtSeconds = Number(issuedAt);
  if (issuedAtSeconds > nowSeconds + META_DELETION_FUTURE_SKEW_SECONDS) {
    throw new ApiError(
      400,
      "Signed request issued_at is too far in the future.",
      "future_signed_request",
    );
  }

  if (nowSeconds - issuedAtSeconds > META_DELETION_MAX_AGE_SECONDS) {
    throw new ApiError(400, "Signed request has expired.", "stale_signed_request");
  }

  return "fresh" as const;
}

export function getMetaDeletionRequestHash(params: {
  appId: string;
  encodedPayload: string;
}) {
  return createHash("sha256")
    .update(`meta_data_deletion:${params.appId}:${params.encodedPayload}`)
    .digest("hex");
}

export function getMetaDeletionConfirmationCode(requestHash: string) {
  if (!/^[a-f0-9]{64}$/i.test(requestHash)) {
    throw new ApiError(400, "Deletion request hash is invalid.", "invalid_deletion_request_hash");
  }

  return requestHash.slice(0, 20).toLowerCase();
}

export function getMetaDeletionUserHash(appId: string, userId: string) {
  return createHash("sha256").update(`${appId}:${userId}`).digest("hex");
}

export async function acceptMetaDeletionResponsibility(params: {
  client?: MetaDeletionClient;
  requestHash: string;
  confirmationCode: string;
  userHash: string;
  userIdEncrypted: string;
  issuedAt?: number;
  freshnessStatus: "fresh" | "missing";
}) {
  const client = params.client ?? (createAdminClient() as MetaDeletionClient | null);

  if (!client) {
    throw new ApiError(
      503,
      "Deletion request responsibility store is unavailable.",
      "meta_deletion_store_unavailable",
    );
  }

  const { data, error } = await client.rpc("accept_meta_data_deletion_request", {
    p_request_hash: params.requestHash,
    p_confirmation_code: params.confirmationCode,
    p_user_id_hash: params.userHash,
    p_user_id_encrypted: params.userIdEncrypted,
    p_issued_at:
      typeof params.issuedAt === "number"
        ? new Date(params.issuedAt * 1000).toISOString()
        : null,
    p_freshness_status: params.freshnessStatus,
  });

  if (error) {
    throw new ApiError(
      500,
      error.message || "Deletion request responsibility could not be persisted.",
      "meta_deletion_responsibility_failed",
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as AcceptedDeletionRow | null;
  if (
    !row ||
    typeof row.id !== "string" ||
    typeof row.confirmation_code !== "string" ||
    typeof row.responsibility_status !== "string" ||
    !META_DELETION_RESPONSIBILITY_STATUSES.has(row.responsibility_status)
  ) {
    throw new ApiError(
      500,
      "Deletion request responsibility store returned an invalid acknowledgement.",
      "meta_deletion_responsibility_invalid",
    );
  }

  return {
    id: row.id,
    confirmationCode: row.confirmation_code,
    responsibilityStatus: row.responsibility_status as
      | "operator_required"
      | "in_progress"
      | "completed"
      | "rejected",
    replayed: row.replayed === true,
  };
}

export async function getMetaDeletionPublicStatus(params: {
  client?: MetaDeletionStatusClient;
  confirmationCode: string;
}) {
  const confirmationCode = params.confirmationCode.trim().toLowerCase();
  if (!/^[a-f0-9]{20}$/.test(confirmationCode)) {
    return null;
  }

  const client = params.client ?? (createAdminClient() as MetaDeletionStatusClient | null);
  if (!client) {
    throw new ApiError(
      503,
      "Deletion request status is temporarily unavailable.",
      "meta_deletion_status_unavailable",
    );
  }

  const { data, error } = await client
    .from("meta_data_deletion_requests")
    .select("confirmation_code,responsibility_status,first_received_at,last_received_at,completed_at")
    .eq("confirmation_code", confirmationCode)
    .maybeSingle();

  if (error) {
    throw new ApiError(
      503,
      "Deletion request status is temporarily unavailable.",
      "meta_deletion_status_unavailable",
    );
  }
  if (!data) {
    return null;
  }

  const status = String(data.responsibility_status ?? "");
  if (!META_DELETION_RESPONSIBILITY_STATUSES.has(status)) {
    throw new ApiError(
      503,
      "Deletion request status is temporarily unavailable.",
      "meta_deletion_status_invalid",
    );
  }

  return {
    confirmationCode,
    status: status as "operator_required" | "in_progress" | "completed" | "rejected",
    firstReceivedAt: String(data.first_received_at),
    lastReceivedAt: String(data.last_received_at),
    completedAt: typeof data.completed_at === "string" ? data.completed_at : null,
  };
}
