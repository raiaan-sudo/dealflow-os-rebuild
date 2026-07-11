import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
  parseRouteParams,
} from "@/lib/api/route";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import {
  getSelectedAdIdsFromPlan,
  withSelectedAdIds,
} from "@/lib/services/campaign-plan-document";
import { persistCampaignPlanDocumentUpdate } from "@/lib/services/campaign-plan-persistence-service";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

const paramsSchema = z.object({
  id: z.string().min(1),
});

const bodySchema = z.object({
  selectedAdId: z.string().min(1).optional(),
  selectedAdIds: z.array(z.string().min(1)).min(1).max(6).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string>> | Record<string, string> },
) {
  try {
    assertSameOriginRequest(request);
    const auth = await getAuthenticatedContext();
    const { id } = await parseRouteParams(context.params, paramsSchema);
    const body = await parseJsonBody(request, bodySchema);
    const selectedAdIds = Array.from(
      new Set([...(body.selectedAdIds ?? []), ...(body.selectedAdId ? [body.selectedAdId] : [])]),
    ).slice(0, 6);
    const supabase = await createRouteHandlerClient();

    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
    }

    const { data, error } = await supabase
      .from("campaign_plans")
      .select("plan, user_id, organization_id")
      .eq("id", id)
      .eq("organization_id", auth.organizationId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const row = (data as {
      plan?: unknown;
      user_id?: string | null;
      organization_id?: string | null;
    } | null) ?? null;

    if (!row) {
      throw new ApiError(404, "Campaign not found.", "campaign_not_found");
    }

    if (row.organization_id !== auth.organizationId) {
      throw new ApiError(404, "Campaign not found.", "campaign_not_found");
    }

    const currentPlan = row?.plan ?? {};
    if (selectedAdIds.length === 0) {
      throw new ApiError(400, "Select at least one creative before continuing.", "selected_ads_missing");
    }

    const existingSelectedAdIds = getSelectedAdIdsFromPlan(currentPlan);

    if (
      existingSelectedAdIds.length === selectedAdIds.length &&
      existingSelectedAdIds.every((selectedId, index) => selectedId === selectedAdIds[index])
    ) {
      return NextResponse.json({
        campaign_id: id,
        selected_ad_id: selectedAdIds[0],
        selected_ad_ids: selectedAdIds,
        unchanged: true,
      });
    }

    const nextPlan = withSelectedAdIds(currentPlan, selectedAdIds);

    await persistCampaignPlanDocumentUpdate({
      supabase,
      campaignId: id,
      organizationId: auth.organizationId,
      plan: nextPlan,
      userId: auth.userId,
      source: "select_ad",
    });

    return NextResponse.json({
      campaign_id: id,
      selected_ad_id: selectedAdIds[0],
      selected_ad_ids: selectedAdIds,
    });
  } catch (error) {
    return handleApiError(error, "Select ad");
  }
}
