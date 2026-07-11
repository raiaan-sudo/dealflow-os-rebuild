import { ApiError } from "@/lib/api/route";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { Database, Json } from "@/lib/supabase/types";

type CampaignPlanRow = Database["public"]["Tables"]["campaign_plans"]["Row"];

type CreateCampaignPlanWithEntitlementParams = {
  campaignId: string;
  organizationId: string;
  userId: string;
  plan: Json;
  launchStatus?: string | null;
  leadLoopVerified?: boolean;
  publicSlug?: string | null;
};

function readDatabaseMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return "Campaign creation failed.";
  }

  const message =
    "message" in error && typeof error.message === "string" ? error.message.trim() : "";
  const details =
    "details" in error && typeof error.details === "string" ? error.details.trim() : "";
  return [message, details].filter(Boolean).join(" | ") || "Campaign creation failed.";
}

/**
 * The only application path allowed to create campaign_plans rows.
 *
 * The security-definer RPC takes an organization-scoped transaction lock,
 * verifies the actor against persisted membership, reads persisted billing
 * state, enforces the preview limit, and inserts in that same transaction.
 * Neither a client-provided plan tier nor a preflight count is trusted.
 */
export async function createCampaignPlanWithEntitlement(
  params: CreateCampaignPlanWithEntitlementParams,
) {
  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(
      503,
      "Campaign creation is unavailable because the service role is not configured.",
      "campaign_creation_service_unavailable",
    );
  }

  const { data, error } = await (admin as any).rpc(
    "create_campaign_plan_with_entitlement_v1",
    {
      p_campaign_id: params.campaignId,
      p_organization_id: params.organizationId,
      p_user_id: params.userId,
      p_plan: params.plan,
      p_launch_status: params.launchStatus ?? null,
      p_lead_loop_verified: params.leadLoopVerified === true,
      p_public_slug: params.publicSlug ?? null,
    },
  );

  if (error) {
    const message = readDatabaseMessage(error);

    if (/campaign_preview_limit_reached/i.test(message)) {
      throw new ApiError(
        409,
        "This workspace already has its preview campaign. Activate an eligible paid plan before creating another campaign.",
        "campaign_preview_limit_reached",
      );
    }

    if (/campaign_creation_actor_not_member/i.test(message)) {
      throw new ApiError(
        403,
        "You do not have access to create a campaign in this workspace.",
        "campaign_creation_forbidden",
      );
    }

    if (/campaign_creation_identity_collision/i.test(message)) {
      throw new ApiError(
        409,
        "That campaign identity is already owned by another workspace or user.",
        "campaign_creation_identity_collision",
      );
    }

    if (/campaign_creation_billing_ambiguous/i.test(message)) {
      throw new ApiError(
        409,
        "Campaign creation is blocked until the workspace billing record is reconciled.",
        "campaign_creation_billing_ambiguous",
      );
    }

    throw new ApiError(500, message, "campaign_creation_failed");
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row || typeof row.id !== "string") {
    throw new ApiError(
      500,
      "Campaign creation completed without a recoverable campaign record.",
      "campaign_creation_result_missing",
    );
  }

  return row as CampaignPlanRow;
}
