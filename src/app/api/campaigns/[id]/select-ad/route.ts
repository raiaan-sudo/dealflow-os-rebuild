import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, parseJsonBody, parseRouteParams } from "@/lib/api/route";
import {
  getSelectedAdIdFromPlan,
  withSelectedAdId,
} from "@/lib/services/campaign-plan-document";
import { persistCampaignPlanDocumentUpdate } from "@/lib/services/campaign-plan-persistence-service";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

const paramsSchema = z.object({
  id: z.string().min(1),
});

const bodySchema = z.object({
  selectedAdId: z.string().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string>> | Record<string, string> },
) {
  try {
    const { id } = await parseRouteParams(context.params, paramsSchema);
    const { selectedAdId } = await parseJsonBody(request, bodySchema);
    const supabase = await createRouteHandlerClient();

    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
    }

    const { data, error } = await supabase
      .from("campaign_plans")
      .select("plan")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const row = (data as { plan?: unknown } | null) ?? null;

    const currentPlan = row?.plan ?? {};
    const existingSelectedAdId = getSelectedAdIdFromPlan(currentPlan);

    if (existingSelectedAdId === selectedAdId) {
      return NextResponse.json({ campaign_id: id, selected_ad_id: selectedAdId, unchanged: true });
    }

    const nextPlan = withSelectedAdId(currentPlan, selectedAdId);

    await persistCampaignPlanDocumentUpdate({
      supabase,
      campaignId: id,
      plan: nextPlan,
      source: "select_ad",
    });

    return NextResponse.json({ campaign_id: id, selected_ad_id: selectedAdId });
  } catch (error) {
    return handleApiError(error, "Select ad");
  }
}
