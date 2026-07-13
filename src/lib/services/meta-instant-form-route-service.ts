import "server-only";

import { ApiError } from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FullCampaignRecord } from "@/lib/types/campaign-records";
import { buildMetaInstantFormDefinition } from "@/lib/services/meta-instant-form-service";
import { provisionMetaLeadgenRouteForCampaign } from "@/lib/services/meta-leadgen-route-service";

export async function provisionCompletedMetaInstantFormRoute(params: {
  record: FullCampaignRecord;
  organizationId: string;
  actorUserId: string;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(
      503,
      "Meta Instant Form route storage is unavailable.",
      "meta_leadgen_storage_unavailable",
    );
  }
  const definition = buildMetaInstantFormDefinition(params.record);
  const { data, error } = await (admin as any)
    .from("meta_instant_form_provisioning")
    .select("provider_form_id,status,definition_digest")
    .eq("campaign_id", params.record.campaign.id)
    .eq("definition_digest", definition.digest)
    .limit(2);
  const rows = (data ?? []) as Array<{
    provider_form_id?: string | null;
    status?: string | null;
    definition_digest?: string | null;
  }>;
  if (error || rows.length !== 1) {
    throw new ApiError(
      409,
      error?.message ?? "Exactly one completed Meta Instant Form receipt is required.",
      "meta_instant_form_receipt_missing",
    );
  }
  const receipt = rows[0]!;
  if (
    receipt.status !== "created" ||
    receipt.definition_digest !== definition.digest ||
    !/^\d{5,40}$/.test(receipt.provider_form_id ?? "")
  ) {
    throw new ApiError(
      409,
      "The Meta Instant Form receipt is not complete for this campaign definition.",
      "meta_instant_form_receipt_incomplete",
    );
  }

  return provisionMetaLeadgenRouteForCampaign({
    actorUserId: params.actorUserId,
    organizationId: params.organizationId,
    campaignId: params.record.campaign.id,
    providerFormId: receipt.provider_form_id!,
  });
}
