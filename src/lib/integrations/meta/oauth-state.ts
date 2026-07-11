import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";

const META_OAUTH_STATE_TTL_MS = 10 * 60_000;

export function hashMetaOAuthState(state: string) {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function metaOAuthStateMatches(returnedState: string, cookieState: string) {
  const returned = Buffer.from(returnedState, "utf8");
  const expected = Buffer.from(cookieState, "utf8");
  return returned.length === expected.length && timingSafeEqual(returned, expected);
}

export async function createMetaOAuthStateBinding(params: {
  userId: string;
  organizationId: string;
  returnTo: string;
  now?: Date;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const state = crypto.randomUUID();
  const now = params.now ?? new Date();
  const expiresAt = new Date(now.getTime() + META_OAUTH_STATE_TTL_MS).toISOString();
  const { error } = await admin.from("meta_oauth_states").insert({
    state_hash: hashMetaOAuthState(state),
    user_id: params.userId,
    organization_id: params.organizationId,
    return_to: params.returnTo,
    expires_at: expiresAt,
  } as never);

  if (error) {
    throw new ApiError(
      500,
      error.message ?? "Meta OAuth state could not be created.",
      "meta_oauth_state_create_failed",
    );
  }

  return { state, expiresAt };
}

export async function consumeMetaOAuthStateBinding(params: {
  state: string;
  userId: string;
  organizationId: string;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await (admin as any).rpc("consume_meta_oauth_state", {
    p_state_hash: hashMetaOAuthState(params.state),
    p_user_id: params.userId,
    p_organization_id: params.organizationId,
  });

  if (error || typeof data !== "string" || !data.startsWith("/")) {
    throw new ApiError(
      400,
      "Meta connection state is invalid, expired, already used, or belongs to another workspace.",
      "meta_state_invalid",
    );
  }

  return { returnTo: data };
}
